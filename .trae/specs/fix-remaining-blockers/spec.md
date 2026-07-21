# 清理项目剩余阻碍问题 Spec

## Why

经过多轮修复（E2E 超时、技术债务、CodeRabbit 审查、MediaPipe 自托管），项目 CI 已全绿、功能基本可用。但仍存在 3 类阻碍项目干净交付的剩余问题：(1) `fix-pages-mediapipe-loading` spec 的代码修复已完成但文档状态未同步，导致项目状态不清晰；(2) eslint 有 13 个 warnings（含 coverage 目录污染、React hooks 依赖问题）；(3) GitHub Actions 仍使用 Node.js 20 已废弃的 actions 版本，未来 CI 可能失败。

## What Changes

- 关闭 `fix-pages-mediapipe-loading` spec：更新 tasks.md/checklist.md 反映实际完成状态（代码已修复，仅剩端到端验证）
- 修复 eslint 配置：排除 `coverage/` 目录，消除 3 个无用 eslint-disable warnings
- 修复 React hooks lint warnings：5 处 `react-hooks/exhaustive-deps` warnings（ref value in cleanup、missing dependency、useMemo 建议）
- 修复测试文件 `no-explicit-any` warning
- 升级 GitHub Actions actions 版本：checkout@v4→v5, setup-node@v4→v5, upload-artifact@v4→v5，消除 Node.js 20 deprecated 警告
- 更新 `rewrite-avatar-with-animation-mixer` spec Task 6 手动验证项状态（标记为需用户手动验证，不阻碍 CI）

## Impact

- Affected specs: `fix-pages-mediapipe-loading`（关闭）、`rewrite-avatar-with-animation-mixer`（更新状态）
- Affected code:
  - `frontend/eslint.config.js` — 排除 coverage 目录
  - `frontend/src/components/avatar/Avatar3D.tsx` — 修复 ref value in cleanup
  - `frontend/src/hooks/useAvatarPlayer.ts` — 修复 ref value in cleanup
  - `frontend/src/components/learning/DataCollectionPanel.tsx` — 修复 missing dependency
  - `frontend/src/components/learning/DemoMode.tsx` — 用 useMemo 包裹 steps
  - `frontend/src/hooks/useAvatarPipeline.ts` — 修复 missing dependency
  - `frontend/src/modules/avatar/ClipBuilder.real-vrm-integration.test.ts` — 替换 any 类型
  - `.github/workflows/ci.yml` — 升级 actions 版本
  - `CHANGELOG.md` — 记录变更

## ADDED Requirements

### Requirement: ESLint 零 warnings

系统 SHALL 确保 `npm run lint` 输出 0 errors 且 0 warnings（排除第三方生成文件）。

#### Scenario: lint 无 warning
- **WHEN** 执行 `npm run lint`
- **THEN** 退出码为 0
- **AND** 输出中无 "warning" 字样（coverage 目录已排除）

### Requirement: GitHub Actions 版本兼容

系统 SHALL 使用未废弃的 GitHub Actions actions 版本，不产生 Node.js deprecated 警告。

#### Scenario: CI 无 deprecation 警告
- **WHEN** CI 流水线运行
- **THEN** annotations 中无 "Node.js 20 is deprecated" 警告
- **AND** 所有 actions 使用 v5 或更高版本

## MODIFIED Requirements

### Requirement: Spec 文档与代码状态同步

所有活跃 spec 的 tasks.md 和 checklist.md SHALL 准确反映代码实际完成状态，已完成项标记 `[x]`，未完成项标记 `[ ]` 并附带原因说明。

## REMOVED Requirements

无
