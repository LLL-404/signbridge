# Tasks

- [x] Task 1: 诊断浏览器 wasm 截断根因
  - [x] SubTask 1.1: 服务端验证完整（git 仓库 11,153,617 bytes，curl 下载 11,153,617 bytes）
  - [x] SubTask 1.2: 浏览器报错 `remaining bytes 7609676`（约 7.6MB），与之前 jsdelivr CDN 截断版本大小一致
  - [x] SubTask 1.3: 根因确认：Service Worker `mediapipe-cache`（CacheFirst 策略）缓存了之前从 jsdelivr CDN 下载的截断 wasm

- [x] Task 2: 修正 Service Worker 缓存策略
  - [x] SubTask 2.1: 审查 `vite.config.ts` workbox `runtimeCaching` 中 `mediapipe-cache` 策略
  - [x] SubTask 2.2: 将 handler 从 CacheFirst 改为 NetworkFirst，添加 networkTimeoutSeconds: 30
  - [x] SubTask 2.3: 确认 `globIgnores` 正确排除大文件不预缓存（已有配置）
  - [x] SubTask 2.4: NetworkFirst 策略确保优先从网络获取完整版本，避免缓存截断文件

- [x] Task 3: 自托管剩余 MediaPipe 模型
  - [x] SubTask 3.1: 下载 `pose_landmarker_full.task`（9,398,198 bytes）到 `public/mediapipe/models/`
  - [x] SubTask 3.2: 下载 `hand_landmarker.task`（7,819,105 bytes）到 `public/mediapipe/models/`
  - [x] SubTask 3.3: 待 Task 7 build 验证文件被正确拷贝到 `dist/mediapipe/models/`

- [x] Task 4: 移除硬编码 Google Storage URL
  - [x] SubTask 4.1: 在 `config.ts` 新增 `poseModelUrl`、`handModelUrl` 配置项，默认值基于 `import.meta.env.BASE_URL`
  - [x] SubTask 4.2: 修改 `PoseEstimator.ts`，用 `appConfig.poseModelUrl`、`appConfig.handModelUrl` 替换硬编码 URL
  - [x] SubTask 4.3: 修改 `STGCNRecognizer.ts`，用 `appConfig.handModelUrl` 替换硬编码 URL
  - [x] SubTask 4.4: 全局搜索确认无残留 `storage.googleapis.com` 或 `cdn.jsdelivr.net` 硬编码

- [x] Task 5: 收紧 CSP
  - [x] SubTask 5.1: 修改 `index.html:11`，从 `connect-src` 移除 `https://cdn.jsdelivr.net` 和 `https://storage.googleapis.com`
  - [x] SubTask 5.2: 确认 `'self'` 已包含在 `connect-src`（同源自托管资源所需）
  - [x] SubTask 5.3: tsc 验证通过，待 Task 7 build 验证 CSP 头正确

- [x] Task 6: 更新文档与 CHANGELOG
  - [x] SubTask 6.1: 更新 `.env.example` 新增 `VITE_POSE_MODEL_URL`、`VITE_HAND_MODEL_URL` 配置项说明
  - [x] SubTask 6.2: 更新 `CHANGELOG.md` 记录本次修复（fix: 类型）

- [ ] Task 7: 端到端验证
  > 注：需在 GitHub Pages 部署后手动验证 4 个页面（voice-to-sign/sign-to-text/dialogue/learning）功能正常，无法在本地自动验证
  - [ ] SubTask 7.1: 本地 tsc 退出码 0，lint 0 errors（10 个预先存在 warnings），build 成功，dist/mediapipe/models/ 包含 3 个模型文件
  - [ ] SubTask 7.2: commit 3044aeb 已 push，GitHub Pages 部署成功（Run ID 29850397128，conclusion: success）
  - [ ] SubTask 7.3: 首页 200 OK，/voice-to-sign 通过 404.html SPA 重定向可达，静态资源完整
  - [ ] SubTask 7.4: /sign-to-text 通过 SPA 重定向可达，vision_wasm_internal.wasm 部署完整（11,153,617 bytes），gesture_recognizer.task 完整（8,373,440 bytes）
  - [ ] SubTask 7.5: /dialogue 通过 SPA 重定向可达
  - [ ] SubTask 7.6: /learning 通过 SPA 重定向可达
  - [ ] 静态资源验证：pose_landmarker_full.task（9,398,198 bytes）、hand_landmarker.task（7,819,105 bytes）、wasm 文件全部 200 OK 且完整
  - [ ] CSP 验证：connect-src 'self' blob: data:;（外部 CDN 白名单已移除）

# Task Dependencies

- Task 2 依赖 Task 1（确认根因后决定是否需调整缓存策略）
- Task 3、Task 4、Task 5 相互独立，可并行
- Task 6 依赖 Task 3、4、5 完成
- Task 7 依赖 Task 1-6 全部完成
