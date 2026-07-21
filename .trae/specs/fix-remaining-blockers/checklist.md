# Checklist

## 阶段一：关闭 fix-pages-mediapipe-loading spec
- [x] C1.1: `fix-pages-mediapipe-loading/tasks.md` Task 2-6 已标记 `[x]`
- [x] C1.2: `fix-pages-mediapipe-loading/checklist.md` 已完成项标记 `[x]`
- [x] C1.3: Task 7（端到端验证）保留 `[ ]` 并附带说明

## 阶段二：修复 ESLint warnings
- [x] C2.1: `eslint.config.js` ignores 包含 `coverage/**`
- [x] C2.2: `npm run lint` 不输出 coverage 目录的 warnings
- [x] C2.3: `Avatar3D.tsx` ref value in cleanup warning 已消除
- [x] C2.4: `useAvatarPlayer.ts` ref value in cleanup warning 已消除
- [x] C2.5: `DataCollectionPanel.tsx` missing dependency warning 已消除
- [x] C2.6: `useAvatarPipeline.ts` missing dependency warning 已消除（2 处）
- [x] C2.7: `DemoMode.tsx` steps useMemo warning 已消除（4 处）
- [x] C2.8: `ClipBuilder.real-vrm-integration.test.ts` no-explicit-any warning 已消除
- [x] C2.9: `npm run lint` 输出 0 errors 0 warnings

## 阶段三：升级 GitHub Actions
- [x] C3.1: `ci.yml` 中 `actions/checkout` 使用 `@v5` 或更高
- [x] C3.2: `ci.yml` 中 `actions/setup-node` 使用 `@v5` 或更高
- [x] C3.3: `ci.yml` 中 `actions/upload-artifact` 使用 `@v5` 或更高
- [x] C3.4: `deploy-pages.yml` 同步升级（`configure-pages@v6`、`upload-pages-artifact@v5`、`deploy-pages@v5`）

## 阶段四：全量验证与提交
- [x] C4.1: `npx tsc --noEmit -p tsconfig.app.json` 退出码 0
- [x] C4.2: `npm run lint` 0 errors 0 warnings
- [x] C4.3: `npm run test` 全部通过（820/820）
- [x] C4.4: `npm run build` 构建成功
- [x] C4.5: `CHANGELOG.md` [Unreleased] 有新增条目（fix(lint)、chore(ci)、docs(spec)）
- [x] C4.6: git commit + push 成功
- [x] C4.7: CI 流水线全绿，无 Node.js deprecated 警告（CI 29852154411 success, Deploy Pages 29852154385 success）
