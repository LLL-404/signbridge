# Tasks

- [ ] Task 1: 提交未提交的 git 变更
  - [ ] SubTask 1.1: 检查 `git status` 确认 31 个变更文件
  - [ ] SubTask 1.2: 执行 `git add` 暂存所有变更（排除 .tmp-upload/，该目录已从 git 跟踪移除）
  - [ ] SubTask 1.3: 执行 `git commit` 提交变更，commit message 涵盖：ESLint 修复、.tmp-upload 清理、CI lint 步骤、IK 几何修复、真实 VRM 集成测试等

- [ ] Task 2: 验证 VRM 模型懒加载
  - [ ] SubTask 2.1: 启动 dev server，用浏览器开发者工具 Network 面板验证首页加载不请求 `models/avatar.vrm`
  - [ ] SubTask 2.2: 导航到 /voice-to-sign 页面，确认 VRM 模型通过 lazy() 异步加载
  - [ ] SubTask 2.3: 如发现首屏请求 VRM，修复加载策略

- [ ] Task 3: PerformancePanel 添加包体积指标
  - [ ] SubTask 3.1: 在 `usePerformanceMonitor.ts` 中添加首屏 chunk 大小采集逻辑（通过 PerformanceObserver API 获取 resource entries）
  - [ ] SubTask 3.2: 在 `PerformancePanel.tsx` 中添加包体积指标展示区域（首屏 chunk 大小 KB、加载时间 ms）
  - [ ] SubTask 3.3: 验证 PerformancePanel 正确显示包体积指标

- [ ] Task 4: 运行 Lighthouse 性能验证
  - [ ] SubTask 4.1: 构建生产版本 `npx vite build`
  - [ ] SubTask 4.2: 启动 preview server `npx vite preview`
  - [ ] SubTask 4.3: 运行 Lighthouse 审计，记录 Performance 评分、LCP、FCP
  - [ ] SubTask 4.4: 如评分 < 90 或 LCP > 800ms 或 FCP > 1.5s，分析瓶颈并优化

- [ ] Task 5: 实现 AvatarDriver 穿模检测 hook
  - [ ] SubTask 5.1: 在 `AvatarDriver.ts` 的 `update()` 方法中添加穿模检测逻辑（检测手腕世界位置是否穿入躯干边界）
  - [ ] SubTask 5.2: 穿模时输出警告日志（不中断动画播放）
  - [ ] SubTask 5.3: 验证穿模检测在 Mixamo 重定向动画播放时正常工作

- [ ] Task 6: E2E 测试验证与修复
  - [ ] SubTask 6.1: 安装 Playwright 浏览器（如未安装）`npx playwright install chromium`
  - [ ] SubTask 6.2: 运行 `npx playwright test` 执行全部 E2E 测试
  - [ ] SubTask 6.3: 修复失败的 E2E 测试（如有）
  - [ ] SubTask 6.4: 在 `.github/workflows/ci.yml` 单元测试后添加 E2E 测试步骤

- [ ] Task 7: 更新 CHANGELOG.md
  - [ ] SubTask 7.1: 在 [Unreleased] 记录所有变更（性能优化、穿模检测、E2E 测试、CI 完善）

# Task Dependencies
- Task 1（提交变更）独立，应最先执行
- Task 2（VRM 懒加载验证）、Task 3（PerformancePanel）、Task 5（穿模检测）相互独立，可并行
- Task 4（Lighthouse 验证）依赖 Task 2/3 完成
- Task 6（E2E 测试）独立，但应在所有功能修改完成后运行
- Task 7（CHANGELOG）依赖所有其他任务完成
