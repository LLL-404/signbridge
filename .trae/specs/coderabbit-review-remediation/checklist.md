# CodeRabbit 审查整改验收清单

## P0 首屏性能

- [x] Checkpoint 1: `useAvatarPlayer.ts` 不再每帧调用 `setPose`，pose 通过 ref 传递
- [x] Checkpoint 2: `AvatarCanvas.tsx` 已被 `React.memo` 包裹
- [x] Checkpoint 3: `useRecognizer.ts` 和 `PracticeFlow.tsx` 中 3 处 `eslint-disable react-hooks/exhaustive-deps` 已消除
- [x] Checkpoint 4: `npm run lint` 这 3 处 warning 消失

## P1 正确性与稳定性

- [x] Checkpoint 5: `useVRMModel.ts` 不再使用 `as unknown as` 绕过私有字段
- [x] Checkpoint 6: `VRMAdapter.ts` 已暴露 `setVRM(vrm)` 公开方法
- [x] Checkpoint 7: `SignToTextPage.tsx` 帧循环 setState 已优化（仅在值变化时 setState）
- [x] Checkpoint 8: `VRMCache.ts` `dbPromise` 在 rejected 后自动重置为 null
- [x] Checkpoint 9: `ClipBuilder.ts` 模块级可变状态已封装为 `ClipBuildContext`
- [x] Checkpoint 10: `WorkerUtils.ts` `loadGestureLibrary` 失败时输出 `log.warn`
- [x] Checkpoint 11: `DataCollectionPanel.tsx` 所有 `setTimeout` 在卸载时 `clearTimeout`

## 全量验证

- [x] Checkpoint 12: `npx tsc -b` exit 0
- [x] Checkpoint 13: `npm run lint` 无新增 error
- [x] Checkpoint 14: `npm run test` 全部通过（数量 ≥ 820）
- [x] Checkpoint 15: `npm run build` 成功
- [x] Checkpoint 16: [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md) `[Unreleased]` 区段新增修复条目
- [x] Checkpoint 17: git commit 完成（不 push）
