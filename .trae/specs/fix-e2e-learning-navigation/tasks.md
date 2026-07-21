# Tasks

## 阶段一：E2E 测试修复

- [x] Task 1: 修改 E2E 测试加 yield 点
  - [x] SubTask 1.1: 修改 `frontend/e2e/app.spec.ts:33` 测试，在每次 `page.goto` 后加 `page.evaluate(() => {})`
  - [x] SubTask 1.2: 删除调试文件 `frontend/e2e/debug.spec.ts`
  - [x] SubTask 1.3: 本地跑 `npx playwright test e2e/app.spec.ts` 验证通过

## 阶段二：代码健壮性

- [x] Task 2: SequenceClassifier 添加取消机制
  - [x] SubTask 2.1: 修改 `frontend/src/modules/recognition/SequenceClassifier.ts`，添加 `cancelled` 标志和 `cancelInit()` 方法
  - [x] SubTask 2.2: 在 `init()` 每个 await 后检查 `this.cancelled`
  - [x] SubTask 2.3: `dispose()` 时设置 `this.cancelled = true`
  - [x] SubTask 2.4: 修改 `frontend/src/hooks/useRecognizer.ts`，cleanup 时调用 `cancelInit()` 再 `dispose()`
  - [x] SubTask 2.5: 验证 `npx tsc --noEmit -p tsconfig.app.json` 通过
  - [x] SubTask 2.6: 验证 `npm run test` 通过

## 阶段三：全量验证与提交

- [x] Task 3: 全量验证与提交
  - [x] SubTask 3.1: `npx tsc --noEmit -p tsconfig.app.json` 类型检查通过
  - [x] SubTask 3.2: `npm run lint` 无新增 error
  - [x] SubTask 3.3: `npm run test` 单元测试全部通过（819/819）
  - [x] SubTask 3.4: `npm run build` 构建成功
  - [x] SubTask 3.5: 本地跑 `npx playwright test` 全部 E2E 测试通过（23 passed + 1 skipped）
  - [x] SubTask 3.6: 更新 `CHANGELOG.md`
  - [x] SubTask 3.7: git commit + push
  - [x] SubTask 3.8: 监控 CI 流水线状态（CI 5m8s 全绿，E2E 测试通过；Deploy Pages 成功）

# Task Dependencies

- Task 1 和 Task 2 相互独立，可并行
- Task 3 依赖 Task 1 和 Task 2 完成
