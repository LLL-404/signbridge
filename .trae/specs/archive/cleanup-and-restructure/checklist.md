# 整理重构验收清单

## 根目录整洁性
- [x] 根目录不存在 `test_arch_upgrade.py`、`test_extended.py`、`test_speed.py`
- [x] 根目录不存在 `test-extended.png`、`test-page-loaded.png`、`test-screenshot.png`、`test-speed.png`
- [x] 根目录不存在 `网站不用部署就能浏览？TRAE Work 一招搞定！.html`
- [x] 根目录保留 `README.md`、`index.html`（创意展示页）、`start.bat`、`start.ps1`、`byteplus-pages.yaml`、`.gitignore`
- [x] 根目录保留 `frontend/`、`docs/`、`.github/` 目录

## frontend 顶层整洁性
- [x] `frontend/` 顶层不存在 `test-lstm.mjs`、`test-sign-model.mjs`
- [x] `frontend/scripts/` 下保留 `reindex-codegraph.sh`、`test-sign-model.mjs`、`test-sign-model-simple.mjs`

## 文档集中管理
- [x] `docs/` 目录存在
- [x] `docs/CODE_WIKI.md` 存在
- [x] `docs/DEMO_SCRIPT.md` 存在
- [x] `docs/DEPLOY_GUIDE.md` 存在
- [x] `docs/PRESENTATION_OUTLINE.md` 存在
- [x] `docs/superpowers/` 目录及其内容未被改动
- [x] 根目录不再存在 `CODE_WIKI.md`、`DEMO_SCRIPT.md`、`DEPLOY_GUIDE.md`、`PRESENTATION_OUTLINE.md`（已迁移）

## 文档与代码结构一致
- [x] `docs/CODE_WIKI.md` 中不再引用 `PagePlaceholder.tsx`、`useSpeechRecognition.ts`、`SpeechRecognizer.ts`
- [x] `docs/CODE_WIKI.md` 中包含 `kernel/` 目录说明（EventBus、PluginManager）
- [x] `docs/CODE_WIKI.md` 中包含 `plugins/` 目录说明
- [x] `docs/CODE_WIKI.md` 中包含 `components/avatar/VRMModel.tsx`、`NonManualMarkerOverlay.tsx`
- [x] `docs/CODE_WIKI.md` 中包含 `components/common/`（ErrorBoundary、PageHeader）
- [x] `docs/CODE_WIKI.md` 中包含 `components/debug/PerformancePanel.tsx`
- [x] `docs/CODE_WIKI.md` 中包含 `components/learning/` 全部文件（含 DataCollectionPanel、DemoMode）
- [x] `docs/CODE_WIKI.md` 中包含 `modules/avatar/` 全部文件（含 Retargeter、Smoother、VRMAdapter、VRMPoseAdapter）
- [x] `docs/CODE_WIKI.md` 中包含 `modules/recognition/` 全部文件（含 CompositeRecognizer、ContinuousRecognizer、WorkerRecognizer、recognition.worker 等）
- [x] `docs/CODE_WIKI.md` 中包含 `modules/data/` 全部文件（含 CommonVocabulary、DataCollector）
- [x] `docs/CODE_WIKI.md` 项目结构树状图与实际目录一致

## README.md 准确性
- [x] `README.md` 项目结构章节包含 `kernel/` 目录说明
- [x] `README.md` 项目结构章节包含 `plugins/` 目录说明
- [x] `README.md` 项目结构章节不引用已不存在的文件
- [x] `README.md` 项目文件章节将文档路径指向 `docs/` 目录

## 业务代码未被改动
- [x] `frontend/src/` 下所有业务代码文件未被改动（git diff 确认）
- [x] 整理仅涉及：删除散落文件、迁移文档、更新文档内容
