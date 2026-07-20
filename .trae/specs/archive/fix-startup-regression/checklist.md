# 修复启动性能回归验收清单

## 回归根因定位

- [x] Checkpoint 1: 已定位引入回归的具体 commit（通过 git bisect 或逐 commit 对比）
- [x] Checkpoint 2: 已记录冷启动日志（"ready in xxxms"、"new dependencies optimized" 次数），确认 Vite 预构建是否为瓶颈
- [x] Checkpoint 3: 已检查 `dist/stats.html`，确认首屏 chunk 是否包含 tfjs/three.js 等重模块
- [x] Checkpoint 4: 已检查首屏默认路由 `/voice-to-sign` 的同步 import 链，记录是否有重量级同步 import

## Vite dev server 预构建优化

- [x] Checkpoint 5: `vite.config.ts` `optimizeDeps.include` 已显式列出重量级依赖
- [x] Checkpoint 6: 删除 `frontend/node_modules/.vite` 后 `npm run dev` 冷启动，"ready in xxxms" 有改善
- [x] Checkpoint 7: 冷启动后浏览器首次打开页面，不出现 "new dependencies optimized, reloading" 刷新
- [x] Checkpoint 8: dev server 功能正常（页面加载、路由切换、HMR 正常）

## 首屏同步重 import 修复（条件性）

- [x] Checkpoint 9: 如 Task 1.4 发现同步重 import，已改为动态 import 或 React.lazy
- [x] Checkpoint 10: 如执行修复，`npm run build` 首屏 chunk 体积下降

## 全量验证

- [x] Checkpoint 11: `npx tsc -b` exit 0
- [x] Checkpoint 12: `npm run lint` 无新增 error
- [x] Checkpoint 13: `npm run test` 单元测试全部通过（数量与修复前持平或增加）
- [x] Checkpoint 14: `npm run build` 成功，首屏 chunk 不含 `@tensorflow/*` / `three/*` / `@pixiv/three-vrm`
- [x] Checkpoint 15: [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md) `[Unreleased]` 区段新增修复条目
- [x] Checkpoint 16: git commit 完成（不 push）
