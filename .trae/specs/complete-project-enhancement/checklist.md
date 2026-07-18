# Checklist

## 第一轮：提交变更

- [ ] Checkpoint 1: git 变更已提交
  - 验证: `git status` 显示 working tree clean（或仅有 .tmp-upload 本地文件）
  - 验证: `git log -1` 显示最新 commit 包含 ESLint 修复、.tmp-upload 清理、CI 配置等

## 第二轮：性能优化验证

- [ ] Checkpoint 2: VRM 模型懒加载验证
  - 验证: 首页加载时 Network 面板不包含 `models/avatar.vrm` 请求
  - 验证: 导航到 /voice-to-sign 后 VRM 模型异步加载
- [ ] Checkpoint 3: PerformancePanel 显示包体积指标
  - 验证: PerformancePanel 包含首屏 chunk 大小（KB）
  - 验证: PerformancePanel 包含首屏加载时间（ms）
- [ ] Checkpoint 4: Lighthouse 性能评分 > 90
  - 验证: Lighthouse Performance 评分 > 90
- [ ] Checkpoint 5: LCP < 800ms
  - 验证: Lighthouse LCP 指标 < 800ms
- [ ] Checkpoint 6: FCP < 1.5s
  - 验证: Lighthouse FCP 指标 < 1.5s

## 第三轮：功能增强

- [ ] Checkpoint 7: AvatarDriver 穿模检测 hook 已实现
  - 验证: `AvatarDriver.update()` 中包含穿模检测逻辑
  - 验证: 检测到手腕穿入躯干时输出警告日志
  - 验证: 穿模检测不中断动画播放

## 第四轮：E2E 测试

- [ ] Checkpoint 8: E2E 测试全部通过
  - 验证: `npx playwright test` 全部通过
- [ ] Checkpoint 9: CI 配置包含 E2E 测试步骤
  - 验证: `.github/workflows/ci.yml` 包含 E2E 测试步骤

## 第五轮：整体验证

- [ ] Checkpoint 10: TypeScript 编译通过
  - 验证: `npx tsc -b` exit code 0
- [ ] Checkpoint 11: 单元测试全部通过
  - 验证: `npx vitest run` 全部通过
- [ ] Checkpoint 12: ESLint 无 error
  - 验证: `npx eslint .` exit code 0
- [ ] Checkpoint 13: 生产构建成功
  - 验证: `npx vite build` exit code 0
- [ ] Checkpoint 14: CHANGELOG.md 已记录所有变更
  - 验证: CHANGELOG.md [Unreleased] 包含性能优化、穿模检测、E2E 测试、CI 完善的记录
