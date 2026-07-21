# 修复 GitHub Pages MediaPipe 资源加载 Spec

## Why

前序工作已将 MediaPipe wasm/模型自托管到 `public/mediapipe/`，但 GitHub Pages 部署后浏览器仍报 `WebAssembly.instantiate` 截断错误（`length 9681696, remaining bytes 7609676`）。服务端验证文件完整（11,153,617 bytes），说明问题出在浏览器侧缓存层。同时 `PoseEstimator.ts`、`STGCNRecognizer.ts` 仍有硬编码 `storage.googleapis.com` URL，`index.html` CSP 仍白名单外部 CDN，未完成自托管闭环。

本 spec 旨在系统性排查浏览器侧加载失败根因，完成剩余硬编码 URL 自托管化，收紧 CSP，确保 4 个页面在 GitHub Pages 部署后正常运行。

## What Changes

- 诊断并修复浏览器 wasm 截断根因（Service Worker 缓存 / HTTP cache / Cache API）
- 自托管剩余 MediaPipe 模型：`pose_landmarker_full.task`、`hand_landmarker.task`
- 移除 `PoseEstimator.ts`、`STGCNRecognizer.ts` 中硬编码 `storage.googleapis.com` URL，改用 `appConfig`
- 在 `config.ts` 新增 `poseModelUrl`、`handModelUrl` 配置项
- 收紧 `index.html` CSP：移除 `cdn.jsdelivr.net`、`storage.googleapis.com` 白名单
- 更新 `.env.example` 文档新增配置项说明
- 端到端验证 4 个页面（语音转手语 / 手语识别 / 双向对话 / 手语学习）在 GitHub Pages 运行正常

## Impact

- Affected specs: 无直接关联 spec
- Affected code:
  - `frontend/src/config.ts` — 新增配置项
  - `frontend/src/modules/recognition/PoseEstimator.ts` — 替换硬编码 URL
  - `frontend/src/modules/recognition/STGCNRecognizer.ts` — 替换硬编码 URL
  - `frontend/index.html` — 收紧 CSP
  - `frontend/public/mediapipe/models/` — 新增自托管模型文件
  - `frontend/.env.example` — 新增配置项文档
  - `frontend/vite.config.ts` — 可能调整 workbox 缓存策略
  - `CHANGELOG.md` — 记录变更

## ADDED Requirements

### Requirement: MediaPipe 资源自托管闭环

系统 SHALL 将所有 MediaPipe wasm 文件和模型文件（gesture_recognizer.task、pose_landmarker_full.task、hand_landmarker.task）自托管于 `public/mediapipe/`，通过 `import.meta.env.BASE_URL` 自动适配子路径部署。

#### Scenario: 手语识别页 wasm 加载成功

- **WHEN** 用户访问 GitHub Pages 部署的 `/signbridge/sign-to-text`
- **THEN** 浏览器成功加载 `vision_wasm_internal.wasm`（11,153,617 bytes 完整）
- **AND** `GestureRecognizer` 初始化成功，无 `ModuleFactory not set` 错误
- **AND** 摄像头开启后能识别手势

#### Scenario: 姿态估计模型加载成功

- **WHEN** `PoseEstimator` 初始化
- **THEN** 从自托管路径加载 `pose_landmarker_full.task` 和 `hand_landmarker.task`
- **AND** 不发起任何 `storage.googleapis.com` 请求

### Requirement: Service Worker 缓存策略修正

系统 SHALL 确保 Service Worker 不会缓存截断或不完整的 wasm/task 文件，并在资源更新时正确失效旧缓存。

#### Scenario: wasm 文件更新后旧缓存失效

- **WHEN** 部署新版本 wasm 文件
- **THEN** Service Worker 检测到文件变更
- **AND** 清除 `mediapipe-cache` 中的旧版本
- **AND** 从网络拉取完整新版本

### Requirement: CSP 收紧

系统 SHALL 移除 CSP 中不再使用的外部 CDN 白名单，仅允许自托管资源。

#### Scenario: CSP 不允许外部 CDN

- **WHEN** 检查 `index.html` 的 Content-Security-Policy
- **THEN** `connect-src` 不包含 `cdn.jsdelivr.net`
- **AND** `connect-src` 不包含 `storage.googleapis.com`
- **AND** `connect-src` 包含 `'self'` 以允许同源自托管资源

## MODIFIED Requirements

### Requirement: 集中化外部资源配置

`config.ts` SHALL 新增 `poseModelUrl` 和 `handModelUrl` 配置项，默认值基于 `import.meta.env.BASE_URL` 拼接自托管路径，支持通过环境变量覆盖。

## REMOVED Requirements

无
