# Checklist

## 第一轮：审计发现（已完成）

- [x] Checkpoint 1: TypeScript 编译验证
  - 证据: `npx tsc -b` exit code 0
- [x] Checkpoint 2: 单元测试验证
  - 证据: `npx vitest run` 675/675 通过，25 个测试文件，14.73s
- [x] Checkpoint 3: 生产构建验证
  - 证据: `npx vite build` exit code 0，17.22s
- [x] Checkpoint 4: 依赖架构校验
  - 证据: `npx depcruise src --config --output-type err` — no dependency violations found (151 modules, 477 dependencies)
- [x] Checkpoint 5: ESLint 检查
  - 证据: `npx eslint .` 发现 3 个 error，14 problems (3 errors, 11 warnings)
- [x] Checkpoint 6: git 跟踪文件检查
  - 证据: `git ls-files .tmp-upload/` 返回 578 个文件，`git status --short` 显示状态为 `A`（staged）
- [x] Checkpoint 7: CI 配置检查
  - 证据: `.github/workflows/ci.yml` 无 lint 步骤，仅有 checkout/setup-node/ci/tsc/depcruise/test/build

## 第二轮：修复验证

- [x] Checkpoint 8: ClipBuilder.ts prefer-const 错误已修复
  - 验证: 第 445 行 `let elbowHint` 改为 `const elbowHint`，`npx eslint src/modules/avatar/ClipBuilder.ts` 无 error
- [x] Checkpoint 9: usePerformanceMonitor.ts set-state-in-effect 错误已修复
  - 验证: TTFB 计算移入 useState lazy initializer，从 useEffect 删除同步 setReport，`npx eslint src/hooks/usePerformanceMonitor.ts` 无 error
- [x] Checkpoint 10: AvatarCanvas.tsx set-state-in-effect 错误已修复
  - 验证: WebGL 检测移入 useState lazy initializer `useState(() => hasWebGL())`，删除 useEffect 同步调用，去掉 unused setter，`npx eslint src/components/avatar/AvatarCanvas.tsx` 无 error
- [x] Checkpoint 11: 全项目 ESLint 无 error
  - 验证: `npx eslint .` exit code 0，0 errors, 12 warnings
- [x] Checkpoint 12: .tmp-upload 已从 git 跟踪移除
  - 验证: `git ls-files .tmp-upload/` 输出为空
- [x] Checkpoint 13: .gitignore 包含 .tmp-upload/ 条目
  - 验证: `.gitignore` 第 38-39 行包含 `# 临时上传文件（浏览器自动化调试产物）` 和 `.tmp-upload/`
- [x] Checkpoint 14: CI 配置包含 lint 步骤
  - 验证: `.github/workflows/ci.yml` 第 36-37 行包含 `- name: 代码规范检查` 和 `run: npm run lint`

## 第三轮：可运行性端到端验证

- [x] Checkpoint 15: TypeScript 编译通过
  - 验证: `npx tsc -b` exit code 0
- [x] Checkpoint 16: 单元测试全部通过
  - 验证: `npx vitest run` 675/675 passed (25 test files)，15.54s
- [x] Checkpoint 17: ESLint 无 error
  - 验证: `npx eslint .` exit code 0，0 errors, 12 warnings
- [x] Checkpoint 18: 生产构建成功
  - 验证: `npx vite build` exit code 0，PWA precache 71 entries
- [x] Checkpoint 19: 开发服务器启动并响应
  - 验证: `npm run dev` 启动 Vite v5.4.21（869ms 就绪），HTTP GET http://localhost:5173/ 返回 200，响应包含 `<div id="root"></div>`
- [x] Checkpoint 20: CHANGELOG.md 已记录所有修复
  - 验证: CHANGELOG.md [Unreleased] 包含 fix(lint) ESLint 修复记录、chore .tmp-upload 清理记录、chore(ci) lint 步骤记录
