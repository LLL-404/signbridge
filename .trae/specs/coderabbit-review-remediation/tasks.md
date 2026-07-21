# Tasks

## 阶段一：P0 首屏性能瓶颈修复

- [x] Task 1: 修复 useAvatarPlayer 每帧 setState 导致 60fps React 重渲染
  - [x] SubTask 1.1: 读取 [useAvatarPlayer.ts](file:///d:/G/github/signbridge/frontend/src/hooks/useAvatarPlayer.ts) 和 [AvatarCanvas.tsx](file:///d:/G/github/signbridge/frontend/src/components/avatar/AvatarCanvas.tsx)，理解当前 pose 传递机制
  - [x] SubTask 1.2: 将 `setPose(driver.getCurrentPose())` 改为通过 ref 传递（`poseRef.current = driver.getCurrentPose()`），仅在播放状态变化时 setState；或用 throttle 节流到 ~30fps
  - [x] SubTask 1.3: 对 AvatarCanvas 加 `React.memo` 包裹，仅 mode/vrmLoadFailed 变化时重渲染
  - [x] SubTask 1.4: 验证 `npx tsc -b` exit 0，`npm run test` 全通过

- [x] Task 2: 修复 3 处 eslint-disable react-hooks/exhaustive-deps
  - [x] SubTask 2.1: 修复 [useRecognizer.ts:191, 224](file:///d:/G/github/signbridge/frontend/src/hooks/useRecognizer.ts) — 用 ref 同步最新值并显式加入依赖，移除 eslint-disable
  - [x] SubTask 2.2: 修复 [PracticeFlow.tsx:125](file:///d:/G/github/signbridge/frontend/src/components/learning/PracticeFlow.tsx) — 同上方法
  - [x] SubTask 2.3: `npm run lint` 确认这 3 处 eslint-disable 已消除且无新 warning

## 阶段二：P1 正确性与稳定性修复

- [x] Task 3: 修复 useVRMModel 类型断言绕过私有字段
  - [x] SubTask 3.1: 在 [VRMAdapter.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/VRMAdapter.ts) 暴露 `setVRM(vrm: VRM)` 公开方法，内部处理 dispose 旧实例
  - [x] SubTask 3.2: 修改 [useVRMModel.ts:203](file:///d:/G/github/signbridge/frontend/src/hooks/useVRMModel.ts) 调用 `setVRM` 方法，移除 `as unknown as`
  - [x] SubTask 3.3: `npx tsc -b` exit 0

- [x] Task 4: 修复 SignToTextPage 帧循环过度 setState
  - [x] SubTask 4.1: 读取 [SignToTextPage.tsx:122-157](file:///d:/G/github/signbridge/frontend/src/pages/SignToTextPage.tsx)，理解 4 次 setState 的触发条件
  - [x] SubTask 4.2: 用 ref 缓存上次值，仅在值实际变化时 setState（或合并为单一 state 对象）
  - [x] SubTask 4.3: `npx tsc -b` exit 0，`npm run test` 全通过

- [x] Task 5: 修复 VRMCache dbPromise rejected 后无法恢复
  - [x] SubTask 5.1: 修改 [VRMCache.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/VRMCache.ts) 的 `dbPromise` 初始化逻辑，在 catch 中重置为 null
  - [x] SubTask 5.2: 验证现有 VRMCache 测试仍通过（可能需补 "IDB 失败后重试" 测试用例）

- [x] Task 6: 修复 ClipBuilder 模块级可变状态
  - [x] SubTask 6.1: 读取 [ClipBuilder.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts) 的模块级变量（currentVRMConstraints/vrmcHitCount/vrmcFallbackCount）
  - [x] SubTask 6.2: 封装为 `ClipBuildContext` 对象，作为参数显式传递给子函数
  - [x] SubTask 6.3: `npx tsc -b` exit 0，`npm run test` 全通过（含 ClipBuilder 测试）

- [x] Task 7: 修复 loadGestureLibrary 静默失败
  - [x] SubTask 7.1: 修改 [WorkerUtils.ts:261-281](file:///d:/G/github/signbridge/frontend/src/modules/recognition/WorkerUtils.ts)，在 `getAll.onerror` 和 `req.onerror` 中加 `log.warn` 后再 `resolve([])`

- [x] Task 8: 修复 DataCollectionPanel setTimeout 未清理
  - [x] SubTask 8.1: 修改 [DataCollectionPanel.tsx](file:///d:/G/github/signbridge/frontend/src/components/learning/DataCollectionPanel.tsx)，用 `timersRef` 收集所有 setTimeout 返回值
  - [x] SubTask 8.2: 在 useEffect 清理函数中统一 `clearTimeout`

## 阶段三：验证与提交

- [ ] Task 9: 全量验证并提交
  - [ ] SubTask 9.1: `npx tsc -b` exit 0
  - [ ] SubTask 9.2: `npm run lint` 无新增 error（且 3 处 eslint-disable 已消除）
  - [ ] SubTask 9.3: `npm run test` 全部通过（数量 ≥ 820）
  - [ ] SubTask 9.4: `npm run build` 成功
  - [ ] SubTask 9.5: 更新 [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md)
  - [ ] SubTask 9.6: git commit（不 push）

# Task Dependencies

- Task 1-8 之间无强依赖，可并行执行（但建议分批：P0 先行）
- Task 9 依赖 Task 1-8 全部完成
- Task 1（useAvatarPlayer）和 Task 3（useVRMModel）都涉及 avatar 渲染链，建议串行避免冲突
- Task 6（ClipBuilder 重构）改动面较大，建议单独子代理执行
