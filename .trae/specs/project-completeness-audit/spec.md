# 项目完整性与可运行性审计 Spec

## Why
用户要求检查项目是否完整、查缺补漏，实事求是，且要真正能够运行。经过系统性审计，发现项目在编译、测试、构建层面均通过，但存在 3 个 ESLint 错误未被 CI 拦截、578 个临时文件被 git 跟踪、CI 缺少 lint 步骤等问题，影响项目整洁性与可维护性。

## 审计结果（实事求是）

### ✅ 已验证通过
| 验证项 | 结果 | 证据 |
|--------|------|------|
| TypeScript 编译 | 通过 | `npx tsc -b` exit code 0 |
| 单元测试 | 675/675 通过 | 25 个测试文件，14.73s |
| 生产构建 | 成功 | `npx vite build` exit code 0，17.22s |
| 依赖架构校验 | 通过 | 151 modules，477 dependencies，0 违规 |
| VRM 模型文件 | 存在 | avatar.vrm 10.7MB |
| 依赖安装 | 完整 | node_modules 存在 |

### ❌ 发现的问题
1. **ESLint 3 个错误**（CI 未检查，可 silently 合并）
   - `src/hooks/useAvatarPlayer.ts:127:5` — react-hooks/set-state-in-effect
   - `src/hooks/usePerformanceMonitor.ts:53:7` — react-hooks/set-state-in-effect
   - `src/modules/avatar/ClipBuilder.ts:445:9` — prefer-const（elbowHint 应为 const）

2. **CI 配置不完整**
   - `.github/workflows/ci.yml` 缺少 ESLint 检查步骤，导致 lint 错误可合并到 master

3. **项目整洁性严重问题**
   - `.tmp-upload/` 目录有 **578 个文件被 git 跟踪**（已 staged，状态 `A`）
   - 包含 200+ 张临时截图、5 个 Python 脚本（cdp_upload.py, debug_form.py, fill_form.py, final_submit.py, submit_form.py）
   - 根目录 `.gitignore` 未忽略 `.tmp-upload/`
   - 这些文件属于浏览器自动化调试产物，不应纳入版本控制

4. **构建 chunk 大小警告**（非阻塞）
   - tfjs-vendor 1.59MB 超过 1000KB 限制
   - three-vendor 962KB 接近限制

## What Changes
- 修复 3 个 ESLint 错误，使 `npx eslint .` 退出码为 0
- 从 git 跟踪中移除 `.tmp-upload/` 目录全部 578 个文件，并在 `.gitignore` 中忽略该目录
- 完善 CI 配置，在类型检查后增加 ESLint 检查步骤
- 验证开发服务器能正常启动并提供服务
- 更新 CHANGELOG.md 记录所有修复

## Impact
- Affected specs: cleanup-and-restructure（项目整理重构，本 spec 延续其整洁性目标）
- Affected code:
  - `frontend/src/hooks/useAvatarPlayer.ts`（修复 set-state-in-effect）
  - `frontend/src/hooks/usePerformanceMonitor.ts`（修复 set-state-in-effect）
  - `frontend/src/modules/avatar/ClipBuilder.ts`（let → const）
  - `.gitignore`（增加 `.tmp-upload/` 忽略）
  - `.github/workflows/ci.yml`（增加 lint 步骤）
  - `CHANGELOG.md`（记录变更）
- 风险：ESLint 修复涉及 React Hooks 模式调整，需确保不改变运行时行为；.tmp-upload 移除不影响项目功能

## ADDED Requirements

### Requirement: ESLint 零错误
项目 SHALL 通过 `npx eslint .` 检查，退出码为 0，无 error（warning 可接受）。

#### Scenario: ESLint 检查通过
- **WHEN** 执行 `npx eslint .`
- **THEN** 退出码为 0
- **AND** 无 error 级别问题

### Requirement: CI 包含 ESLint 检查
CI 流水线 SHALL 在类型检查步骤后执行 ESLint 检查，确保 lint 错误无法合并到 master。

#### Scenario: PR 含 lint 错误时 CI 失败
- **WHEN** PR 包含 ESLint error
- **THEN** CI 流水线在 lint 步骤失败
- **AND** PR 无法合并到 master

### Requirement: 临时文件不纳入版本控制
项目 SHALL 不将 `.tmp-upload/` 目录及其内容纳入 git 跟踪。

#### Scenario: .tmp-upload 不被 git 跟踪
- **WHEN** 执行 `git ls-files .tmp-upload/`
- **THEN** 输出为空
- **AND** `.gitignore` 包含 `.tmp-upload/` 条目

### Requirement: 开发服务器可正常启动
项目 SHALL 能通过 `npm run dev` 启动开发服务器，并在浏览器中正常加载页面。

#### Scenario: 开发服务器启动并响应
- **WHEN** 执行 `npm run dev`
- **THEN** Vite 开发服务器在 5173 端口启动
- **AND** HTTP GET http://localhost:5173/ 返回 200
- **AND** 响应包含 root div 与 main.tsx 脚本引用

## MODIFIED Requirements

### Requirement: CI 流水线
`.github/workflows/ci.yml` 在"类型检查"步骤后增加"代码规范检查"步骤，执行 `npm run lint`。

## REMOVED Requirements
无
