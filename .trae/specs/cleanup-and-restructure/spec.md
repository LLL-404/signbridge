# 项目整理重构 Spec

## Why

SignBridge 项目经过快速迭代后，根目录与 `frontend/` 顶层散落了大量临时测试脚本、截图、营销 HTML 文件，且 `CODE_WIKI.md` 描述的项目结构与实际代码结构存在偏差（如 `PagePlaceholder.tsx`、`useSpeechRecognition.ts`、`SpeechRecognizer.ts` 等文件在文档中提及但实际不存在）。这些混乱会拖慢后续迭代、误导新成员对项目结构的理解，需要在 TRAE 大赛交付前进行一次系统性整理，提升项目可维护性。

## What Changes

### 一、根目录清理
- 删除根目录散落的 Python 测试脚本：`test_arch_upgrade.py`、`test_extended.py`、`test_speed.py`
- 删除根目录散落的测试截图：`test-extended.png`、`test-page-loaded.png`、`test-screenshot.png`、`test-speed.png`
- 删除与项目无关的营销 HTML 文件：`网站不用部署就能浏览？TRAE Work 一招搞定！.html`
- 评估并保留根目录 `index.html`（创意提案展示页，README 中明确提及，与 `frontend/index.html` 应用入口不同，**保留**）
- 整理根目录文档：保留 `README.md`，其余文档（`CODE_WIKI.md`、`DEMO_SCRIPT.md`、`DEPLOY_GUIDE.md`、`PRESENTATION_OUTLINE.md`）迁移至 `docs/` 目录

### 二、frontend 顶层清理
- 删除 `frontend/test-lstm.mjs`、`frontend/test-sign-model.mjs`（与 `frontend/scripts/test-sign-model*.mjs` 重复）
- 评估 `frontend/scripts/` 下的脚本：
  - `reindex-codegraph.sh` —— 保留（代码图谱重建工具）
  - `test-sign-model.mjs`、`test-sign-model-simple.mjs` —— 保留（模型测试脚本，属于开发工具）

### 三、文档对齐
- 更新 `CODE_WIKI.md`：与实际代码结构对齐
  - 移除不存在的文件引用：`PagePlaceholder.tsx`、`useSpeechRecognition.ts`、`SpeechRecognizer.ts`
  - 补充实际存在但未记录的文件：`VRMModel.tsx`、`NonManualMarkerOverlay.tsx`、`DataCollectionPanel.tsx`、`DemoMode.tsx`、`PerformancePanel.tsx`、`PageHeader.tsx`、`ErrorBoundary.tsx`
  - 补充 `kernel/`、`plugins/` 目录说明（微内核架构核心，原文档未充分描述）
  - 补充 `modules/avatar/` 下实际存在但未记录的文件：`Retargeter.ts`、`Smoother.ts`、`VRMAdapter.ts`、`VRMPoseAdapter.ts`、`HandShape.vrm.test.ts`
  - 补充 `modules/recognition/` 下实际存在但未记录的文件：`CompositeRecognizer.ts`、`ContinuousRecognizer.ts`、`DataAugmentor.ts`、`RuleRecognizer.ts`、`WorkerRecognizer.ts`、`WorkerUtils.ts`、`recognition.worker.ts`
  - 补充 `modules/data/` 下实际存在但未记录的文件：`CommonVocabulary.ts`、`DataCollector.ts`
- 更新 `README.md` 项目结构章节：与实际结构对齐（移除"PagePlaceholder"等不存在的描述，补充 kernel/plugins 模块）
- 文档迁移后更新文档内部的相对引用路径

### 四、文档目录结构
- 创建 `docs/` 目录结构：
  ```
  docs/
  ├── CODE_WIKI.md          # 代码知识库
  ├── DEMO_SCRIPT.md        # 演示脚本
  ├── DEPLOY_GUIDE.md       # 部署指南
  └── PRESENTATION_OUTLINE.md  # 演讲大纲
  ```
- 保留 `docs/superpowers/` 现有内容（plans、specs 子目录）

## Impact

- **Affected specs**: 无（首次建立 spec 体系）
- **Affected code**:
  - 根目录：删除 8 个文件，迁移 4 个文档
  - `frontend/`：删除 2 个重复测试脚本
  - `CODE_WIKI.md`、`README.md`：内容修订
- **Affected docs**: `CODE_WIKI.md`、`README.md`、`DEMO_SCRIPT.md`、`DEPLOY_GUIDE.md`、`PRESENTATION_OUTLINE.md`
- **风险**:
  - 删除 Python 测试脚本可能影响某些自动化流程 → 经核查 `.github/workflows/ci.yml` 后确认（如未被引用则安全删除）
  - 文档迁移可能影响外部链接 → 本次为项目内整理，无外部链接依赖
  - **不改动任何 `src/` 下的业务代码逻辑**，仅整理文档与顶层散落文件

## ADDED Requirements

### Requirement: 根目录整洁性
项目根目录 SHALL 仅保留必要文件：`README.md`、`index.html`（创意展示页）、`start.bat`、`start.ps1`、`byteplus-pages.yaml`、`.gitignore`，以及标准目录（`frontend/`、`docs/`、`.github/`）。

#### Scenario: 根目录无散落测试文件
- **WHEN** 查看项目根目录
- **THEN** 不存在 `test_*.py`、`test-*.png`、`test-*.mjs` 等临时测试文件

#### Scenario: 根目录无营销内容
- **WHEN** 查看项目根目录
- **THEN** 不存在与项目无关的营销 HTML 文件

### Requirement: 文档集中管理
项目文档 SHALL 集中存放于 `docs/` 目录，根目录仅保留 `README.md` 作为项目入口文档。

#### Scenario: 文档归集
- **WHEN** 查看 `docs/` 目录
- **THEN** 包含 `CODE_WIKI.md`、`DEMO_SCRIPT.md`、`DEPLOY_GUIDE.md`、`PRESENTATION_OUTLINE.md`

### Requirement: 文档与代码结构一致
`CODE_WIKI.md` 和 `README.md` 中的项目结构描述 SHALL 与实际代码结构完全一致。

#### Scenario: 文档引用的文件均存在
- **WHEN** 读取 `CODE_WIKI.md` 中提到的所有文件路径
- **THEN** 每个文件在实际项目中均存在

#### Scenario: 实际关键文件均被文档记录
- **WHEN** 查看 `frontend/src/` 下的核心模块文件
- **THEN** 这些文件在 `CODE_WIKI.md` 中均有对应说明

### Requirement: frontend 顶层整洁性
`frontend/` 顶层 SHALL 仅保留配置文件与应用入口，不散落临时测试脚本。

#### Scenario: 顶层无重复测试脚本
- **WHEN** 查看 `frontend/` 顶层
- **THEN** 不存在与 `scripts/` 下重复的测试脚本

## MODIFIED Requirements

### Requirement: README 项目结构章节
`README.md` 的"项目结构"章节 SHALL 反映实际的微内核 + 插件化架构，包含 `kernel/`、`plugins/`、`modules/` 各子模块的准确说明。

#### Scenario: README 结构准确
- **WHEN** 读取 `README.md` 项目结构章节
- **THEN** 包含 `kernel/`、`plugins/` 目录说明，且不包含已不存在的文件引用

## REMOVED Requirements

### Requirement: 根目录散落测试脚本
**Reason**: Python 测试脚本（`test_arch_upgrade.py` 等）与前端项目技术栈不符，属于临时调试产物
**Migration**: 如有保留价值，应迁移至 `frontend/scripts/` 或专门的 `tests/` 目录；经核查后无保留价值，直接删除

### Requirement: 根目录测试截图
**Reason**: 测试截图属于一次性调试产物，不应纳入版本控制
**Migration**: 无需迁移，直接删除；后续如需截图应通过 CI 流程生成

### Requirement: 营销 HTML 文件
**Reason**: `网站不用部署就能浏览？TRAE Work 一招搞定！.html` 与项目主体无关
**Migration**: 无需迁移，直接删除
