# 解决技术债务 Spec（基于健康度体检报告）

## Why

刚完成的 [项目健康度体检报告](file:///d:/G/github/signbridge/docs/audits/2026-07-19-project-health-report.md) 识别出 11 项可治理的技术债务，覆盖架构违规、循环依赖、代码复用缺失、文档不一致等问题。本 spec 将这些债务转化为有序的可执行计划，按 P0（必须修复）→ P1（推荐改进）→ P2（可选优化）的优先级逐步清理，**不引入新功能**，仅提升项目可维护性与架构合规度。

## What Changes

### 一、P0 必须修复（2 项）

#### P0-1：修复 `modules/data` ↔ `modules/recognition` 循环依赖

**当前问题**：4 个文件形成真实循环依赖
- [DataCollector.ts:5](file:///d:/G/github/signbridge/frontend/src/modules/data/DataCollector.ts#L5) → `@/modules/recognition/Normalizer`
- [ModelTrainer.ts:6](file:///d:/G/github/signbridge/frontend/src/modules/recognition/ModelTrainer.ts#L6) → `@/modules/data/IndexedDBAdapter`
- [SequenceClassifier.ts:8-9](file:///d:/G/github/signbridge/frontend/src/modules/recognition/SequenceClassifier.ts#L8) → `@/modules/data/{IndexedDBAdapter,VocabularyStore}`
- [TrainingDataGenerator.ts:8-9](file:///d:/G/github/signbridge/frontend/src/modules/recognition/TrainingDataGenerator.ts#L8) → `@/modules/data/{VocabularyStore,DataInitializer}`

**修复方案**：将 `Normalizer`（纯函数模块）从 `modules/recognition/` 下沉到独立的 `modules/normalize/` 目录，打破 data → recognition 方向的依赖。recognition → data 方向的依赖属于合理的数据访问，保留。

#### P0-2：`VRMModel.tsx` 通过 hook 间接访问 `modules/avatar`

**当前问题**：[VRMModel.tsx:27-34](file:///d:/G/github/signbridge/frontend/src/components/avatar/VRMModel.tsx#L27) 单文件 5 处违规 import `@/modules/avatar/*` + 1 处 `@/modules/recognition/PoseEstimator`

**修复方案**：新建 `hooks/useVRMModel.ts`，封装 VRM 加载、约束计算、实时驱动的全部逻辑，VRMModel.tsx 仅通过该 hook 获取渲染所需状态。

### 二、P1 推荐改进（4 项）

#### P1-1：3 个页面改用 hooks 间接访问 modules（13 处违规）

- [VoiceToSignPage.tsx:24-26,32-33](file:///d:/G/github/signbridge/frontend/src/pages/VoiceToSignPage.tsx#L24)：6 处违规
- [DialoguePage.tsx:7-12,17-18](file:///d:/G/github/signbridge/frontend/src/pages/DialoguePage.tsx#L7)：8 处违规
- [SignToTextPage.tsx:18-19,24-25,28-29](file:///d:/G/github/signbridge/frontend/src/pages/SignToTextPage.tsx#L18)：5 处违规

**修复方案**：新增 `hooks/useGrammarEngine.ts`、`hooks/useAvatarPipeline.ts`、`hooks/useRecognizer.ts`，封装对 modules 的访问。

#### P1-2：让页面用上已存在的 `useAvatarPlayer`

**当前问题**：[useAvatarPlayer.ts](file:///d:/G/github/signbridge/frontend/src/hooks/useAvatarPlayer.ts) 已封装 AvatarDriver + pose 状态，但 [VoiceToSignPage.tsx:77-79](file:///d:/G/github/signbridge/frontend/src/pages/VoiceToSignPage.tsx#L77) 和 [DialoguePage.tsx:67-70](file:///d:/G/github/signbridge/frontend/src/pages/DialoguePage.tsx#L67) 各自重复实现，约 50 行重复代码。

**修复方案**：P1-1 的 hooks 改造中，让这两个页面直接调用 `useAvatarPlayer`。

#### P1-3：抽取 `<PracticeFlow>` 通用容器

**当前问题**：[PracticeMode.tsx](file:///d:/G/github/signbridge/frontend/src/components/learning/PracticeMode.tsx) 和 [AITutor.tsx](file:///d:/G/github/signbridge/frontend/src/components/learning/AITutor.tsx) 共享约 60% 相同结构（依赖、CAPTURE_FRAME_COUNT=30、capturing/result 阶段机、framesRef/standardKeypointsRef）。

**修复方案**：新建 `components/learning/PracticeFlow.tsx`，通过 props 注入"出题策略"和"难度调整逻辑"。

#### P1-4：归档 22 个已完成 spec

**当前问题**：`.trae/specs/` 下 31 个 spec 中 22 个已 100% 完成，占用 71% 目录空间，影响活跃 spec 的可发现性。

**修复方案**：
- 新建 `.trae/specs/archive/` 目录
- 用 `git mv` 将 22 个 100% 完成的 spec 迁移到 `archive/`（保留 git rename 痕迹）
- 标注 2 个被废弃的 spec（`fix-vrm-arm-movement`、`fix-vrm-ik-quaternion-transform`）为 DEPRECATED

### 三、P2 可选优化（5 项）

#### P2-1：评估 `kernel/` 中 3 处 `console.*` 是否替换为 logger

**当前情况**：[PluginManager.ts:25-27](file:///d:/G/github/signbridge/frontend/src/kernel/PluginManager.ts#L25) 2 处 console.warn/error + [EventBus.ts:10-11](file:///d:/G/github/signbridge/frontend/src/kernel/EventBus.ts#L10) 1 处 console.error。

**重要修正**：体检报告建议"替换为 logger"，但 kernel 已自实现 log 对象（注释明确写"kernel保持独立，不依赖debug模块"），**替换为 logger 会引入循环依赖**。本 spec 修正为：**保留 kernel 的 console 调用**，仅在注释中说明保留理由。

#### P2-2：`__diagnose_elbow.test.ts` 改名或删除

**当前问题**：[__diagnose_elbow.test.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/__diagnose_elbow.test.ts) 文件名 `__` 前缀导致 vitest 默认配置忽略，未参与 `npm run test`。

**修复方案**：改名为 `diagnose_elbow.test.ts` 纳入测试流程（若测试仍有意义），或删除（若已无价值）。

#### P2-3：抽取 `createPagePlugin()` 工厂

**当前问题**：[plugins/index.ts:42-131](file:///d:/G/github/signbridge/frontend/src/plugins/index.ts#L42) 4 个插件对象结构完全同构，159 行可压缩到约 50 行。

**修复方案**：抽取 `createPagePlugin(opts)` 工厂函数。

#### P2-4：修正 `vite.config.ts:25` 注释

**当前问题**：[vite.config.ts:25](file:///d:/G/github/signbridge/frontend/vite.config.ts#L25) 注释"首屏 gzip 从单体 622KB 降至 ~55KB"与现实偏离——实际首次访问 ~300 KB gzip，~55KB 仅在 PWA 二次访问全缓存命中场景成立。

**修复方案**：修正注释为"首屏 gzip 从单体 622KB 降至 ~300KB（首次访问）；PWA 二次访问缓存命中后 ~55KB"。

#### P2-5：为 3 处 `eslint-disable` 补充注释说明理由

**当前问题**：3 处 `eslint-disable-next-line react-hooks/exhaustive-deps` 缺少理由说明。
- [SignToTextPage.tsx:156](file:///d:/G/github/signbridge/frontend/src/pages/SignToTextPage.tsx#L156)
- [PracticeMode.tsx:67](file:///d:/G/github/signbridge/frontend/src/components/learning/PracticeMode.tsx#L67)
- [AITutor.tsx:82](file:///d:/G/github/signbridge/frontend/src/components/learning/AITutor.tsx#L82)

**修复方案**：每处上方补充一行注释，说明为何忽略依赖。

## Impact

- **Affected specs**: 
  - `audit-project-health`（本 spec 直接执行其建议）
  - `loading-performance-optimization`（P2-4 修正其遗留注释）
  - 22 个已完成 spec（P1-4 归档操作）
- **Affected code**: 
  - 新增：`modules/normalize/`、`hooks/useVRMModel.ts`、`hooks/useGrammarEngine.ts`、`hooks/useAvatarPipeline.ts`、`hooks/useRecognizer.ts`、`components/learning/PracticeFlow.tsx`
  - 修改：`VRMModel.tsx`、`VoiceToSignPage.tsx`、`DialoguePage.tsx`、`SignToTextPage.tsx`、`PracticeMode.tsx`、`AITutor.tsx`、`DataCollector.ts`、`ModelTrainer.ts`、`SequenceClassifier.ts`、`TrainingDataGenerator.ts`、`plugins/index.ts`、`vite.config.ts`、3 处 eslint-disable 文件
  - 删除/改名：`__diagnose_elbow.test.ts`
  - 移动：22 个 spec 目录 → `.trae/specs/archive/`
- **Affected docs**: [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md) 记录所有变更
- **风险**: 
  - P0-1 移动 Normalizer 可能影响 recognition 模块的其他 import，需全局搜索替换
  - P0-2/P1-1 hooks 抽取可能改变组件 re-render 行为，需验证功能无回归
  - P1-4 spec 归档可能影响外部引用，需全局 Grep 检查
  - 所有修改需通过 `npx tsc -b`、`npm run lint`、`npm run test`、`npm run build` 全量验证

## ADDED Requirements

### Requirement: 无循环依赖

`modules/` 下各子模块 SHALL 不存在循环依赖。

#### Scenario: data 与 recognition 无循环

- **WHEN** 执行 `npx depcruise src --config --output-type err`
- **THEN** 输出 "no dependency violations found"
- **AND** 无 data ↔ recognition 的循环依赖报告

### Requirement: 组件不直接访问模块内部实现

`components/` 下的组件 SHALL NOT 直接 import `@/modules/*` 的内部实现，应通过 `hooks/` 间接访问。

#### Scenario: VRMModel 通过 hook 访问

- **WHEN** 读取 `components/avatar/VRMModel.tsx` 的 import 语句
- **THEN** 不出现 `@/modules/avatar/*` 或 `@/modules/recognition/*` 的 import
- **AND** 出现 `@/hooks/useVRMModel` 的 import

#### Scenario: 页面通过 hooks 访问

- **WHEN** 读取 `pages/VoiceToSignPage.tsx`、`pages/DialoguePage.tsx`、`pages/SignToTextPage.tsx` 的 import 语句
- **THEN** 不出现 `@/modules/grammar/*`、`@/modules/avatar/*`、`@/modules/recognition/*` 的直接 import（types 例外）
- **AND** 出现对应的 `@/hooks/*` import

### Requirement: spec 归档

100% 完成的 spec SHALL 被归档到 `.trae/specs/archive/`，根目录仅保留活跃 spec。

#### Scenario: 根目录仅含活跃 spec

- **WHEN** 执行 `ls .trae/specs/`（不含 archive/）
- **THEN** 仅出现部分完成或 0% 完成的 spec 目录
- **AND** `.trae/specs/archive/` 包含 22 个已完成 spec

## MODIFIED Requirements

### Requirement: 代码复用

`components/learning/PracticeMode.tsx` 和 `AITutor.tsx` SHALL 共享 `<PracticeFlow>` 通用容器，重复代码消除 ≥ 60%。

#### Scenario: PracticeFlow 被复用

- **WHEN** 读取 `PracticeMode.tsx` 和 `AITutor.tsx`
- **THEN** 两者都 import 并使用 `<PracticeFlow>`
- **AND** 两文件的合计行数较修改前减少 ≥ 60%

### Requirement: 插件定义简洁性

`plugins/index.ts` SHALL 使用 `createPagePlugin()` 工厂函数定义 4 个插件，消除重复结构。

#### Scenario: 工厂函数被使用

- **WHEN** 读取 `plugins/index.ts`
- **THEN** 出现 `createPagePlugin()` 函数定义
- **AND** 4 个插件均通过该工厂创建
- **AND** 文件总行数 ≤ 80 行（原 159 行）

## REMOVED Requirements

无
