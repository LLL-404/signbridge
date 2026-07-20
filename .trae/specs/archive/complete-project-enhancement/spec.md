# 项目完整性提升 Spec

## Why
用户要求继续开发项目，使其更完整。经过全面调查，项目在功能实现层面基本完整（4 个页面均有实现，675 单元测试通过，构建成功），但在以下 4 个方向存在缺口：31 个 git 变更未提交、性能优化有 5 项未完成、AvatarDriver 穿模检测 hook 未实现、E2E 测试未验证。本 spec 覆盖这 4 个方向，全面提升项目完整性。

## What Changes
- 提交当前 31 个未提交的 git 变更（ESLint 修复、.tmp-upload 清理、CI 配置、spec 文件等）
- 验证 VRM 模型懒加载策略（确认首屏不请求 VRM 模型）
- 在 PerformancePanel 中添加包体积相关指标（首屏 chunk 大小、加载时间）
- 运行 Lighthouse 验证性能评分（目标 > 90，LCP < 800ms，FCP < 1.5s）
- 实现 AvatarDriver 穿模检测 hook（每帧检测手腕是否穿入躯干）
- 运行 E2E 测试验证 4 大功能流程，修复发现的问题
- 在 CI 配置中加入 E2E 测试步骤

## Impact
- Affected specs: bundle-size-optimization（完成其未完成的 5 项 checkpoint）、project-completeness-audit（延续完整性目标）
- Affected code:
  - `frontend/src/components/debug/PerformancePanel.tsx`（添加包体积指标）
  - `frontend/src/hooks/usePerformanceMonitor.ts`（添加包体积数据采集）
  - `frontend/src/modules/avatar/AvatarDriver.ts`（实现穿模检测 hook）
  - `frontend/e2e/app.spec.ts`（修复 E2E 测试问题，如有）
  - `.github/workflows/ci.yml`（添加 E2E 测试步骤）
  - `CHANGELOG.md`（记录变更）

## ADDED Requirements

### Requirement: VRM 模型懒加载验证
系统 SHALL 确保首屏加载时不请求 VRM 模型文件，VRM 模型仅在用户访问包含虚拟人的页面时才加载。

#### Scenario: 首屏不加载 VRM
- **WHEN** 用户首次访问应用首页
- **THEN** 浏览器网络请求中不包含 `models/avatar.vrm`
- **AND** VRM 模型仅在 AvatarCanvas 渲染时通过 `lazy()` 异步加载

### Requirement: PerformancePanel 包体积指标
PerformancePanel SHALL 显示首屏包体积相关指标，包括首屏 chunk 大小和加载时间。

#### Scenario: PerformancePanel 显示包体积
- **WHEN** 用户打开 PerformancePanel
- **THEN** 面板显示首屏 chunk 大小（KB）
- **AND** 面板显示首屏加载时间（ms）

### Requirement: AvatarDriver 穿模检测
AvatarDriver SHALL 在播放 Mixamo 重定向动画时，每帧检测手腕是否穿入躯干，并在穿模时输出警告日志。

#### Scenario: 检测到手腕穿模
- **WHEN** AvatarDriver 播放 Mixamo 重定向动画
- **AND** 手腕世界位置穿入躯干边界
- **THEN** 输出警告日志记录穿模事件
- **AND** 不中断动画播放

### Requirement: E2E 测试在 CI 中运行
CI 流水线 SHALL 在单元测试后执行 E2E 测试，确保 4 大功能流程的端到端完整性。

#### Scenario: PR 触发 E2E 测试
- **WHEN** PR 提交到 master
- **THEN** CI 流水线执行 E2E 测试
- **AND** 测试失败时 PR 无法合并

## MODIFIED Requirements

### Requirement: CI 流水线
`.github/workflows/ci.yml` 在单元测试步骤后增加"E2E 测试"步骤，执行 `npx playwright test`。

## REMOVED Requirements
无
