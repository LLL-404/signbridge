# Checklist

## 阶段一：E2E 测试修复
- [x] C1.1: `frontend/e2e/app.spec.ts:33` 测试中每次 `page.goto` 后有 `page.evaluate(() => {})` yield 点
- [x] C1.2: `frontend/e2e/debug.spec.ts` 已删除
- [x] C1.3: 本地 `npx playwright test e2e/app.spec.ts` 全部通过

## 阶段二：代码健壮性
- [x] C2.1: `SequenceClassifier` 有 `cancelled: boolean` 私有字段
- [x] C2.2: `SequenceClassifier.init()` 每个 `await` 后有 `if (this.cancelled) return;` 检查
- [x] C2.3: `SequenceClassifier.dispose()` 设置 `this.cancelled = true`
- [x] C2.4: `SequenceClassifier` 有公共 `cancelInit()` 方法
- [x] C2.5: `useRecognizer` cleanup 先调用 `cancelInit()` 再 `dispose()`
- [x] C2.6: `npx tsc --noEmit -p tsconfig.app.json` 通过
- [x] C2.7: `npm run test` 819/819 通过

## 阶段三：全量验证与提交
- [x] C3.1: `npm run lint` 无新增 error
- [x] C3.2: `npm run build` 构建成功
- [x] C3.3: 本地 `npx playwright test` 全部 E2E 测试通过
- [x] C3.4: `CHANGELOG.md` [Unreleased] 区段有新增条目
- [x] C3.5: git commit + push 成功
- [x] C3.6: CI 流水线 `app.spec.ts:33` 测试通过（Run ID 29821810265，5m8s 全绿）
