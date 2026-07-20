# Tasks

## 阶段一：P0 必须修复

- [x] Task 1: 修复 modules/data ↔ modules/recognition 循环依赖
  - [x] SubTask 1.1: 全局 Grep 搜索 `@/modules/recognition/Normalizer` 的所有 import 位置
  - [x] SubTask 1.2: 新建 `frontend/src/modules/normalize/` 目录，将 `Normalizer.ts` 移入（用 git mv）
  - [x] SubTask 1.3: 更新所有 import `@/modules/recognition/Normalizer` 为 `@/modules/normalize/Normalizer`
  - [x] SubTask 1.4: 验证 `npx depcruise src --config --output-type err` 无循环依赖
  - [x] SubTask 1.5: 验证 `npx tsc -b` 通过

- [x] Task 2: VRMModel.tsx 通过 hook 间接访问 modules/avatar
  - [x] SubTask 2.1: 读取 `components/avatar/VRMModel.tsx` 全部代码，识别需要封装的逻辑
  - [x] SubTask 2.2: 新建 `hooks/useVRMModel.ts`，封装 VRM 加载、约束计算、实时驱动、PoseEstimator 访问
  - [x] SubTask 2.3: 修改 `VRMModel.tsx`，删除 5 处 `@/modules/avatar/*` + 1 处 `@/modules/recognition/*` import，改用 `useVRMModel`
  - [x] SubTask 2.4: 验证 `npx tsc -b` 通过
  - [x] SubTask 2.5: 验证 `npm run test` 通过（含 Avatar 相关测试）

## 阶段二：P1 推荐改进

- [x] Task 3: 3 个页面改用 hooks 间接访问 modules
  - [x] SubTask 3.1: 新建 `hooks/useGrammarEngine.ts`，封装 GrammarEngine 实例化和调用
  - [x] SubTask 3.2: 新建 `hooks/useAvatarPipeline.ts`，封装 AvatarDriver + VRMAnimator（复用已存在的 useAvatarPlayer）
  - [x] SubTask 3.3: 新建 `hooks/useRecognizer.ts`，封装 WorkerRecognizer/RuleRecognizer/ContinuousRecognizer
  - [x] SubTask 3.4: 修改 `VoiceToSignPage.tsx`，删除 6 处 `@/modules/*` import，改用 hooks
  - [x] SubTask 3.5: 修改 `DialoguePage.tsx`，删除 8 处 `@/modules/*` import，改用 hooks
  - [x] SubTask 3.6: 修改 `SignToTextPage.tsx`，删除 5 处 `@/modules/*` import，改用 hooks
  - [x] SubTask 3.7: 验证 `npx tsc -b` 与 `npm run test` 通过

- [x] Task 4: 抽取 `<PracticeFlow>` 通用容器
  - [x] SubTask 4.1: 读取 `PracticeMode.tsx` 和 `AITutor.tsx` 全文，识别共享结构
  - [x] SubTask 4.2: 新建 `components/learning/PracticeFlow.tsx`，封装共享的依赖、阶段机、ref 模式
  - [x] SubTask 4.3: 重构 `PracticeMode.tsx` 使用 `<PracticeFlow>`，仅保留出题策略逻辑
  - [x] SubTask 4.4: 重构 `AITutor.tsx` 使用 `<PracticeFlow>`，仅保留难度调整逻辑
  - [x] SubTask 4.5: 验证两文件合计行数较修改前减少 ≥ 60%
  - [x] SubTask 4.6: 验证 `npx tsc -b` 与 `npm run test` 通过

- [x] Task 5: 归档 22 个已完成 spec
  - [x] SubTask 5.1: 全局 Grep 检查 `.trae/specs/{spec_name}/` 的外部引用（如 CHANGELOG、文档）
  - [x] SubTask 5.2: 新建 `.trae/specs/archive/` 目录
  - [x] SubTask 5.3: 用 `git mv` 迁移 22 个 100% 完成的 spec 到 `archive/`
  - [x] SubTask 5.4: 在 `fix-vrm-arm-movement/spec.md` 和 `fix-vrm-ik-quaternion-transform/spec.md` 顶部添加 `> **STATUS: DEPRECATED** — 被 rewrite-avatar-with-animation-mixer 取代` 标注
  - [x] SubTask 5.5: 验证根目录 `.trae/specs/` 仅含 9 个活跃 spec + archive/ 目录

## 阶段三：P2 可选优化

- [x] Task 6: kernel/ console 调用评估与注释补充
  - [x] SubTask 6.1: 在 `kernel/PluginManager.ts` 和 `kernel/EventBus.ts` 的 console 调用上方补充注释，说明"kernel 保持独立，不依赖 debug 模块，故保留 console"
  - [x] SubTask 6.2: 验证 `npx tsc -b` 通过

- [x] Task 7: `__diagnose_elbow.test.ts` 处理
  - [x] SubTask 7.1: 读取 `__diagnose_elbow.test.ts` 内容，评估测试是否仍有价值
  - [x] SubTask 7.2: 若有价值，用 `git mv` 改名为 `diagnose_elbow.test.ts`
  - [x] SubTask 7.3: 若无价值，删除文件
  - [x] SubTask 7.4: 验证 `npm run test` 行为符合预期

- [x] Task 8: 抽取 `createPagePlugin()` 工厂
  - [x] SubTask 8.1: 在 `plugins/index.ts` 中定义 `createPagePlugin(opts: {name, path, label, icon, order})` 函数
  - [x] SubTask 8.2: 用工厂重写 4 个插件定义
  - [x] SubTask 8.3: 验证文件总行数 ≤ 80 行
  - [x] SubTask 8.4: 验证 `npx tsc -b` 与 `npm run build` 通过

- [x] Task 9: 修正 `vite.config.ts:25` 注释
  - [x] SubTask 9.1: 将注释从"首屏 gzip 从单体 622KB 降至 ~55KB"改为"首屏 gzip 从单体 622KB 降至 ~300KB（首次访问）；PWA 二次访问缓存命中后 ~55KB"
  - [x] SubTask 9.2: 验证 `npm run build` 通过

- [x] Task 10: 为 3 处 eslint-disable 补充注释
  - [x] SubTask 10.1: 在 `SignToTextPage.tsx:156` eslint-disable 上方补充理由注释
  - [x] SubTask 10.2: 在 `PracticeMode.tsx:67` eslint-disable 上方补充理由注释
  - [x] SubTask 10.3: 在 `AITutor.tsx:82` eslint-disable 上方补充理由注释
  - [x] SubTask 10.4: 验证 `npm run lint` 仍无新增 error

## 阶段四：全量验证与提交

- [x] Task 11: 全量验证
  - [x] SubTask 11.1: `npx tsc -b` 类型检查通过
  - [x] SubTask 11.2: `npm run lint` 无新增 error
  - [x] SubTask 11.3: `npm run test` 单元测试全部通过
  - [x] SubTask 11.4: `npm run build` 构建成功
  - [x] SubTask 11.5: `npx depcruise src --config --output-type err` 无循环依赖

- [x] Task 12: 更新 CHANGELOG 并提交
  - [x] SubTask 12.1: 在 [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md) `[Unreleased]` 记录所有变更
  - [x] SubTask 12.2: git commit（不 push，等用户决定）

# Task Dependencies

- Task 1（循环依赖）与 Task 2（VRMModel hook）相互独立，可并行
- Task 3（页面 hooks）依赖 Task 2 完成（useAvatarPipeline 复用 useVRMModel 模式）
- Task 4（PracticeFlow）独立，可与 Task 1/2/3 并行
- Task 5（spec 归档）独立，可与 Task 1-4 并行
- Task 6-10（P2）相互独立，可并行，且不依赖 P0/P1
- Task 11（全量验证）依赖 Task 1-10 全部完成
- Task 12（CHANGELOG+commit）依赖 Task 11 通过
