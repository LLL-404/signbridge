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
  - [ ] SubTask 7.1: 本地 tsc / lint / build 全部通过
  - [ ] SubTask 7.2: commit 并 push 触发 GitHub Pages 部署
  - [ ] SubTask 7.3: 等 Pages 部署完成，访问 `/signbridge/voice-to-sign` 确认 avatar 正常
  - [ ] SubTask 7.4: 访问 `/signbridge/sign-to-text` 确认 wasm 加载成功、摄像头识别正常
  - [ ] SubTask 7.5: 访问 `/signbridge/dialogue` 确认双向对话页正常
  - [ ] SubTask 7.6: 访问 `/signbridge/learning` 确认学习页正常

# Task Dependencies

- Task 2 依赖 Task 1（确认根因后决定是否需调整缓存策略）
- Task 3、Task 4、Task 5 相互独立，可并行
- Task 6 依赖 Task 3、4、5 完成
- Task 7 依赖 Task 1-6 全部完成
