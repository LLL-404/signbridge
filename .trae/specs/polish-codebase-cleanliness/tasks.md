# Tasks

- [x] Task 1: 清理 Smoother.ts 中 @deprecated 残留
  - [x] SubTask 1.1: 删除 `frontend/src/modules/avatar/Smoother.ts` 中 `slerpRotation` 函数（约 143-160 行，已 Grep 确认无调用方）
  - [x] SubTask 1.2: 修正 `BoneSmoother` 类的 `@deprecated` 标注——移除 @deprecated 行，注释改为"用于 Avatar3D skeleton 模式的骨骼旋转平滑（基于欧拉角分量 One-Euro Filter）"
  - [x] SubTask 1.3: 检查 `Smoother.test.ts` 是否有 `slerpRotation` 的测试用例，若有则同步删除
  - [x] SubTask 1.4: `npx tsc --noEmit -p tsconfig.app.json` 通过

- [x] Task 2: 修正 types/avatar.ts 中 BonePose 的 @deprecated 标注
  - [x] SubTask 2.1: 读取 `frontend/src/types/avatar.ts:28` 附近注释，移除 `@deprecated` 行，注释改为"2D/skeleton 模式使用的姿态结构（17 自创关节名），与 VRMPose 并存"
  - [x] SubTask 2.2: `npx tsc --noEmit -p tsconfig.app.json` 通过

- [x] Task 3: 同步 config.ts 顶部注释环境变量列表
  - [x] SubTask 3.1: 在 `frontend/src/config.ts` 顶部注释的环境变量约定区段，补充 `VITE_POSE_MODEL_URL` 和 `VITE_HAND_MODEL_URL` 两行说明
  - [x] SubTask 3.2: 确认注释中环境变量数量与 `appConfig` 对象实际读取的数量一致（8 个）

- [x] Task 4: 跑 coverage 基线并调整 vitest 阈值
  - [x] SubTask 4.1: 执行 `npm run test:coverage`，收集 modules/ 目录的 statements/branches/functions/lines 实际覆盖率（62.59/82.13/82.6/62.59）
  - [x] SubTask 4.2: 根据实际值，将 `frontend/vitest.config.ts` 中 coverage.thresholds 从 50% 提升到 57/77/77/57（留 5%+ 缓冲）
  - [x] SubTask 4.3: 再次执行 `npm run test:coverage` 验证退出码 0（820/820 passed）

- [x] Task 5: 全量验证
  - [x] SubTask 5.1: `npx tsc --noEmit -p tsconfig.app.json` 0 errors
  - [x] SubTask 5.2: `npm run lint` 0 errors 0 warnings
  - [x] SubTask 5.3: `npm run test` 全部通过（820/820，test:coverage 已确认）
  - [x] SubTask 5.4: `npm run build` 构建成功（15.63s，2011 modules）

- [ ] Task 6: 更新 CHANGELOG 并提交
  - [ ] SubTask 6.1: 在 `CHANGELOG.md` [Unreleased] 记录变更（chore(cleanup): @deprecated 残留清理 + config 注释同步 + coverage 阈值调整）
  - [ ] SubTask 6.2: git commit + push
  - [ ] SubTask 6.3: 监控 CI 流水线全绿

# Task Dependencies

- Task 1、2、3 相互独立，可并行
- Task 4 独立，但建议在 Task 1 之后执行（删除 slerpRotation 可能微调覆盖率）
- Task 5 依赖 Task 1-4 全部完成
- Task 6 依赖 Task 5 通过
