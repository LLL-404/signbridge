# Tasks

## 阶段一：核查与准备

- [x] Task 1: 核查 CI 配置与文件引用，确认删除安全性
  - [x] SubTask 1.1: 读取 `.github/workflows/ci.yml` 和 `deploy-pages.yml`，确认是否引用根目录 Python 测试脚本或测试截图
  - [x] SubTask 1.2: 全局搜索项目内对 `test_arch_upgrade.py`、`test_extended.py`、`test_speed.py` 的引用
  - [x] SubTask 1.3: 全局搜索项目内对 `test-extended.png`、`test-page-loaded.png`、`test-screenshot.png`、`test-speed.png` 的引用
  - [x] SubTask 1.4: 全局搜索项目内对 `网站不用部署就能浏览？TRAE Work 一招搞定！.html` 的引用
  - [x] SubTask 1.5: 核查 `frontend/test-lstm.mjs`、`frontend/test-sign-model.mjs` 是否被 `package.json` scripts 或其他文件引用

## 阶段二：根目录清理

- [x] Task 2: 删除根目录散落的临时文件
  - [x] SubTask 2.1: 删除 Python 测试脚本（`test_arch_upgrade.py`、`test_extended.py`、`test_speed.py`）
  - [x] SubTask 2.2: 删除测试截图（`test-extended.png`、`test-page-loaded.png`、`test-screenshot.png`、`test-speed.png`）
  - [x] SubTask 2.3: 删除营销 HTML 文件（`网站不用部署就能浏览？TRAE Work 一招搞定！.html`）

## 阶段三：frontend 顶层清理

- [x] Task 3: 清理 frontend 顶层重复测试脚本
  - [x] SubTask 3.1: 删除 `frontend/test-lstm.mjs`
  - [x] SubTask 3.2: 删除 `frontend/test-sign-model.mjs`

## 阶段四：文档迁移

- [x] Task 4: 创建 docs 目录并迁移文档
  - [x] SubTask 4.1: 创建 `docs/` 目录（如不存在）
  - [x] SubTask 4.2: 将 `CODE_WIKI.md` 迁移至 `docs/CODE_WIKI.md`
  - [x] SubTask 4.3: 将 `DEMO_SCRIPT.md` 迁移至 `docs/DEMO_SCRIPT.md`
  - [x] SubTask 4.4: 将 `DEPLOY_GUIDE.md` 迁移至 `docs/DEPLOY_GUIDE.md`
  - [x] SubTask 4.5: 将 `PRESENTATION_OUTLINE.md` 迁移至 `docs/PRESENTATION_OUTLINE.md`
  - [x] SubTask 4.6: 保留 `docs/superpowers/` 现有内容不动

## 阶段五：文档对齐

- [x] Task 5: 更新 `docs/CODE_WIKI.md` 与实际代码结构对齐
  - [x] SubTask 5.1: 移除不存在的文件引用（`PagePlaceholder.tsx`、`useSpeechRecognition.ts`、`SpeechRecognizer.ts`）
  - [x] SubTask 5.2: 补充 `kernel/` 目录说明（EventBus、PluginManager、types、index）
  - [x] SubTask 5.3: 补充 `plugins/` 目录说明（内置插件注册中心）
  - [x] SubTask 5.4: 补充 `components/` 下未记录文件（VRMModel.tsx、NonManualMarkerOverlay.tsx、DataCollectionPanel.tsx、DemoMode.tsx、PerformancePanel.tsx、PageHeader.tsx、ErrorBoundary.tsx）
  - [x] SubTask 5.5: 补充 `modules/avatar/` 下未记录文件（Retargeter.ts、Smoother.ts、VRMAdapter.ts、VRMPoseAdapter.ts、HandShape.vrm.test.ts）
  - [x] SubTask 5.6: 补充 `modules/recognition/` 下未记录文件（CompositeRecognizer.ts、ContinuousRecognizer.ts、DataAugmentor.ts、RuleRecognizer.ts、WorkerRecognizer.ts、WorkerUtils.ts、recognition.worker.ts）
  - [x] SubTask 5.7: 补充 `modules/data/` 下未记录文件（CommonVocabulary.ts、DataCollector.ts）
  - [x] SubTask 5.8: 更新项目结构树状图，使其与实际目录一致
  - [x] SubTask 5.9: 更新文档生成时间与版本号

- [x] Task 6: 更新 `README.md` 项目结构章节
  - [x] SubTask 6.1: 更新"项目结构"章节，反映实际目录（移除不存在的文件，补充 kernel/plugins）
  - [x] SubTask 6.2: 更新"项目文件"章节，将文档路径指向 `docs/` 目录
  - [x] SubTask 6.3: 确认技术架构章节描述与实际技术栈一致

## 阶段六：验证

- [x] Task 7: 验证整理结果
  - [x] SubTask 7.1: 验证根目录整洁性（仅保留必要文件）
  - [x] SubTask 7.2: 验证 `frontend/` 顶层无重复测试脚本
  - [x] SubTask 7.3: 验证 `docs/` 目录包含迁移的 4 个文档
  - [x] SubTask 7.4: 验证 `docs/CODE_WIKI.md` 中引用的所有文件路径均存在
  - [x] SubTask 7.5: 验证 `README.md` 项目结构章节与实际目录一致
  - [x] SubTask 7.6: 验证 `src/` 下业务代码未被改动（git diff 仅涉及文档与删除的文件）

# Task Dependencies

- Task 2、Task 3 依赖 Task 1（核查安全性后再删除）
- Task 4 可与 Task 2、Task 3 并行执行（文档迁移与文件删除互不影响）
- Task 5、Task 6 依赖 Task 4（文档迁移完成后再更新内容）
- Task 7 依赖 Task 2、Task 3、Task 4、Task 5、Task 6 全部完成
