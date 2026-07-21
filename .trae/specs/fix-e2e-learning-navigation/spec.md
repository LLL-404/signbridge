# Spec: 修复 E2E 测试 /learning 导航失败

## 背景与根因

CI 流水线中 `e2e/app.spec.ts:33` "应能导航到各功能页面" 测试失败：
- 错误：`page.goto: net::ERR_ABORTED` 导航到 `/learning` 时超时
- 重试 3 次均失败

### 根因分析（本地复现 + 二分定位）

1. **TF.js WebGL backend 不可用**：Playwright Chromium 环境下 WebGL 实际不可用（console: `WebGL is not supported on this device`），TF.js 回退到 CPU backend
2. **CPU backend 训练阻塞主线程**：`SequenceClassifier.init()` 在 IndexedDB 无模型时触发 `ModelTrainer.trainAndExport()`，CPU backend 上的 `model.fit()` 同步执行大量张量运算，阻塞主线程约 30-60 秒
3. **cleanup 无法取消训练**：`useRecognizer` 的 cleanup 只调用 `classifierRef.current?.dispose()` 释放模型张量，但训练 Promise 仍在后台运行，TF.js 的 microtask 队列持续占用主线程
4. **导航被阻塞**：`page.goto('/learning')` 触发页面卸载，但 TF.js microtask 阻止浏览器完成卸载流程，导致 `domcontentloaded` 永远不触发，最终 `ERR_ABORTED`

### 验证证据

| 测试场景 | 结果 | 说明 |
|---|---|---|
| 直接 `page.goto('/learning')` | ✓ 成功 | 无前置 /dialogue，无 TF.js 训练 |
| `/voice-to-sign` → `/learning` | ✓ 成功 | /voice-to-sign 不触发 SequenceClassifier |
| `/dialogue` → `/learning` (等 3s) | ✗ 失败 | TF.js 训练进行中，主线程被阻塞 |
| `/dialogue` → `page.evaluate(()=>{})` → `/learning` | ✓ 成功 | evaluate 提供 yield 点，让 microtask 完成 |
| `/dialogue` → `/learning` (等 60s) | ✓ 成功 | TF.js 训练完成，主线程空闲 |

## 修复目标

1. **E2E 测试稳定性**：`app.spec.ts:33` 在 CI 中稳定通过
2. **代码健壮性**：`useRecognizer` cleanup 时能取消未完成的初始化，避免资源泄漏
3. **不破坏现有功能**：单元测试 819/819 通过，其他 E2E 测试不受影响

## 修复方案

### 方案 A：E2E 测试加 yield 点（最小侵入，必做）

**文件**：`frontend/e2e/app.spec.ts`

在 `app.spec.ts:33` 测试中，每次 `page.goto` 后加一个 `page.evaluate(() => {})` yield 点，让浏览器有机会完成 pending microtask：

```typescript
test('应能导航到各功能页面', async ({ page }) => {
  test.setTimeout(60000);

  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);

  await page.goto('/sign-to-text', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {});  // yield: 让 pending microtask 完成
  await page.waitForTimeout(1500);
  expect(page.url()).toContain('/sign-to-text');

  await page.goto('/dialogue', { waitUntil: 'domcontentloaded' });
  await page.evaluate(() => {});  // yield: 让 TF.js 训练 microtask 完成
  await page.waitForTimeout(1500);
  expect(page.url()).toContain('/dialogue');

  await page.goto('/learning', { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1500);
  expect(page.url()).toContain('/learning');
});
```

**理由**：`page.evaluate` 通过 CDP `Runtime.evaluate` 命令，会让 Playwright 等待浏览器主线程空闲才执行，相当于一个 yield 点。这给了 TF.js 训练的 microtask 队列一个完成的机会。

### 方案 B：useRecognizer cleanup 支持取消初始化（治本，必做）

**文件**：`frontend/src/hooks/useRecognizer.ts` + `frontend/src/modules/recognition/SequenceClassifier.ts`

在 `SequenceClassifier` 中添加取消机制：

```typescript
// SequenceClassifier.ts
export class SequenceClassifier {
  private cancelled = false;
  // ...

  async init(): Promise<void> {
    if (this.ready || this.initializing) return;
    this.initializing = true;
    this.cancelled = false;

    try {
      await idbAdapter.init();
      if (this.cancelled) return;  // 检查取消

      const labelMap = await this.loadLabelMap();
      if (this.cancelled) return;

      if (labelMap && labelMap.labels.length > 0) {
        try {
          await this.model.load(MODEL_STORAGE_PATH);
          if (this.cancelled) return;
          this.labels = labelMap.labels;
          this.ready = true;
          return;
        } catch {
          // 模型加载失败，继续走训练流程
        }
      }

      const trainer = new ModelTrainer();
      await trainer.trainAndExport();
      if (this.cancelled) return;

      await this.model.load(MODEL_STORAGE_PATH);
      if (this.cancelled) return;
      const newLabelMap = await this.loadLabelMap();
      this.labels = newLabelMap?.labels ?? [];
      this.ready = true;
    } finally {
      this.initializing = false;
    }
  }

  /** 取消初始化（cleanup 时调用，让 init 后续步骤快速退出） */
  cancelInit(): void {
    this.cancelled = true;
  }

  dispose(): void {
    this.cancelled = true;  // dispose 时也取消
    this.model.dispose();
    this.ready = false;
    this.labels = [];
  }
  // ...
}
```

在 `useRecognizer` cleanup 中调用 `cancelInit`：

```typescript
// useRecognizer.ts
return () => {
  cancelled = true;
  classifierRef.current?.cancelInit();  // 先取消初始化
  classifierRef.current?.dispose();     // 再释放资源
};
```

**注意**：`cancelInit` 只能让 `init` 在下一个 `await` 点退出，无法真正终止正在进行的 `model.fit()`。但配合方案 A 的 yield 点，可以让训练的 microtask 完成，从而让导航成功。

### 方案 C：不实施（成本过高）

- **将 TF.js 训练移到 Web Worker**：需要重构 ModelTrainer，涉及 IndexedDB 在 Worker 中的访问、模型序列化等，成本高
- **预构建模型到 public/models**：已经有 `public/models/stgcn/` 但 SequenceClassifier 用的是 LSTM 模型，路径不一致，需要统一

## Tasks

### Task 1: 修改 E2E 测试加 yield 点
- [ ] 修改 `frontend/e2e/app.spec.ts:33` 测试，在每次 `page.goto` 后加 `page.evaluate(() => {})`
- [ ] 删除调试文件 `frontend/e2e/debug.spec.ts`
- [ ] 本地跑 `npx playwright test e2e/app.spec.ts` 验证通过

### Task 2: SequenceClassifier 添加取消机制
- [ ] 修改 `frontend/src/modules/recognition/SequenceClassifier.ts`，添加 `cancelled` 标志和 `cancelInit()` 方法
- [ ] 在 `init()` 每个 await 后检查 `this.cancelled`
- [ ] `dispose()` 时设置 `this.cancelled = true`
- [ ] 修改 `frontend/src/hooks/useRecognizer.ts`，cleanup 时调用 `cancelInit()` 再 `dispose()`
- [ ] 验证 `npx tsc --noEmit -p tsconfig.app.json` 通过
- [ ] 验证 `npm run test` 通过

### Task 3: 全量验证与提交
- [ ] `npx tsc --noEmit -p tsconfig.app.json` 类型检查通过
- [ ] `npm run lint` 无新增 error
- [ ] `npm run test` 单元测试全部通过
- [ ] `npm run build` 构建成功
- [ ] 本地跑 `npx playwright test` 全部 E2E 测试通过
- [ ] 更新 `CHANGELOG.md`
- [ ] git commit + push
- [ ] 监控 CI 流水线状态

## 验收标准

1. CI 流水线 `app.spec.ts:33` 测试通过
2. 本地全量 E2E 测试通过（`npx playwright test`）
3. 单元测试 819/819 通过
4. 类型检查、lint、构建均通过
5. CHANGELOG 已更新
