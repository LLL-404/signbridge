# Tasks

- [x] Task 1: 修复 3 个 ESLint 错误
  - [x] SubTask 1.1: 修复 `src/modules/avatar/ClipBuilder.ts:445` 的 prefer-const 错误（`let elbowHint` → `const elbowHint`）
  - [x] SubTask 1.2: 修复 `src/hooks/usePerformanceMonitor.ts:53` 的 react-hooks/set-state-in-effect 错误（TTFB 计算移入 useState lazy initializer）
  - [x] SubTask 1.3: 修复 `src/components/avatar/AvatarCanvas.tsx:127` 的 react-hooks/set-state-in-effect 错误（WebGL 检测移入 useState lazy initializer，去掉 unused setter）
  - [x] SubTask 1.4: 验证 `npx eslint .` 退出码为 0

- [x] Task 2: 清理 .tmp-upload 目录
  - [x] SubTask 2.1: 执行 `git rm -r --cached .tmp-upload/` 从 git 跟踪中移除 578 个文件（保留本地文件）
  - [x] SubTask 2.2: 在根目录 `.gitignore` 增加 `.tmp-upload/` 条目
  - [x] SubTask 2.3: 验证 `git ls-files .tmp-upload/` 输出为空

- [x] Task 3: 完善 CI 配置
  - [x] SubTask 3.1: 在 `.github/workflows/ci.yml` 的"类型检查"步骤后增加"代码规范检查"步骤，执行 `npm run lint`

- [x] Task 4: 验证项目可运行性
  - [x] SubTask 4.1: 执行 `npx tsc -b` 确认 TypeScript 编译通过（exit code 0）
  - [x] SubTask 4.2: 执行 `npx vitest run` 确认测试全部通过（675/675 passed）
  - [x] SubTask 4.3: 执行 `npx eslint .` 确认无 error（0 errors, 12 warnings）
  - [x] SubTask 4.4: 执行 `npx vite build` 确认构建成功（exit code 0）
  - [x] SubTask 4.5: 启动 `npm run dev`，验证 HTTP GET http://localhost:5173/ 返回 200 且包含 `<div id="root">`

- [x] Task 5: 更新 CHANGELOG.md
  - [x] SubTask 5.1: 在 [Unreleased] 记录：fix(lint): 修复 3 个 ESLint 错误；chore: 从 git 移除 .tmp-upload 临时文件并加入 .gitignore；chore(ci): CI 增加 ESLint 检查步骤

# Task Dependencies
- Task 1（ESLint 修复）和 Task 2（清理 .tmp-upload）相互独立，可并行
- Task 3（CI 配置）独立，可与 Task 1/2 并行
- Task 4（验证）依赖 Task 1/2/3 全部完成
- Task 5（CHANGELOG）依赖 Task 4 验证通过
