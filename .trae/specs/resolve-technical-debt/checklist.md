# 解决技术债务验收清单

## P0 必须修复

- [x] Checkpoint 1: `npx depcruise src --config --output-type err` 无循环依赖报告
- [x] Checkpoint 2: `modules/normalize/` 目录存在，`Normalizer.ts` 已移入
- [x] Checkpoint 3: 全局搜索 `@/modules/recognition/Normalizer` 无匹配（已全部改为 `@/modules/normalize/Normalizer`）
- [x] Checkpoint 4: `components/avatar/VRMModel.tsx` 无 `@/modules/avatar/*` 或 `@/modules/recognition/*` 的直接 import
- [x] Checkpoint 5: `hooks/useVRMModel.ts` 文件存在且导出 `useVRMModel` hook
- [x] Checkpoint 6: `npx tsc -b` 通过（P0 修改后）
- [x] Checkpoint 7: `npm run test` 通过（P0 修改后，含 Avatar 相关测试）

## P1 推荐改进

- [x] Checkpoint 8: `hooks/useGrammarEngine.ts`、`hooks/useAvatarPipeline.ts`、`hooks/useRecognizer.ts` 文件存在
- [x] Checkpoint 9: `VoiceToSignPage.tsx`、`DialoguePage.tsx`、`SignToTextPage.tsx` 无 `@/modules/grammar/*`、`@/modules/avatar/*`、`@/modules/recognition/*` 的直接 import（types 例外）
- [x] Checkpoint 10: `VoiceToSignPage.tsx` 和 `DialoguePage.tsx` 使用 `useAvatarPlayer` hook（不再重复实现 AvatarDriver 实例化）
- [x] Checkpoint 11: `components/learning/PracticeFlow.tsx` 文件存在
- [x] Checkpoint 12: `PracticeMode.tsx` 和 `AITutor.tsx` 都 import 并使用 `<PracticeFlow>`
- [x] Checkpoint 13: `PracticeMode.tsx` + `AITutor.tsx` 合计行数较修改前减少 ≥ 60%
- [x] Checkpoint 14: `.trae/specs/archive/` 目录存在，包含 22 个已完成 spec
- [x] Checkpoint 15: `.trae/specs/` 根目录仅含 9 个活跃 spec + archive/ 目录
- [x] Checkpoint 16: `fix-vrm-arm-movement/spec.md` 和 `fix-vrm-ik-quaternion-transform/spec.md` 顶部含 DEPRECATED 标注
- [x] Checkpoint 17: `npx tsc -b` 通过（P1 修改后）
- [x] Checkpoint 18: `npm run test` 通过（P1 修改后）

## P2 可选优化

- [x] Checkpoint 19: `kernel/PluginManager.ts` 和 `kernel/EventBus.ts` 的 console 调用上方有保留理由注释
- [x] Checkpoint 20: `__diagnose_elbow.test.ts` 已被改名（`diagnose_elbow.test.ts`）或删除
- [x] Checkpoint 21: `plugins/index.ts` 含 `createPagePlugin()` 工厂函数，4 个插件通过工厂创建，文件 ≤ 80 行
- [x] Checkpoint 22: `vite.config.ts:25` 注释已修正为"~300KB（首次访问）；PWA 二次访问 ~55KB"
- [x] Checkpoint 23: 3 处 `eslint-disable` 上方均有理由注释
- [x] Checkpoint 24: `npm run lint` 无新增 error

## 全量验证

- [x] Checkpoint 25: `npx tsc -b` 全量类型检查通过
- [x] Checkpoint 26: `npm run lint` 无新增 error
- [x] Checkpoint 27: `npm run test` 单元测试全部通过
- [x] Checkpoint 28: `npm run build` 构建成功
- [x] Checkpoint 29: `npx depcruise src --config --output-type err` 无循环依赖
- [x] Checkpoint 30: [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md) `[Unreleased]` 区段记录所有变更
- [x] Checkpoint 31: git commit 完成（不 push）
