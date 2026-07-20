# Tasks

## 阶段一：定位回归根因

- [x] Task 1: 定位启动回归的 commit 与根因
  - [x] SubTask 1.1: 对比 `c075aaa`（loading-performance-optimization 完成时）与当前 `HEAD`，用 `git bisect` 或逐 commit 对比 `npm run dev` 冷启动时间，定位引入回归的 commit
  - [x] SubTask 1.2: 删除 `frontend/node_modules/.vite` 后执行 `npm run dev`，记录冷启动日志（"ready in xxxms"、"new dependencies optimized" 出现的次数和耗时），确认是否为 Vite 预构建慢
  - [x] SubTask 1.3: 执行 `npm run build`，检查 `dist/stats.html` 确认首屏 chunk（index + react-vendor + state-vendor）是否包含 tfjs/three.js 等重模块
  - [x] SubTask 1.4: 检查首屏默认路由 `/voice-to-sign` 的同步 import 链（VoiceToSignPage → 其依赖 → 是否同步引入 tfjs/three.js），记录是否有重量级同步 import
  - [x] SubTask 1.5: 汇总根因结论，决定修复方案（optimizeDeps.include 列表 + 是否需要改 lazy import）

## 阶段二：优化 Vite dev server 预构建

- [x] Task 2: 配置 optimizeDeps.include 显式预构建重量级依赖
  - [x] SubTask 2.1: 根据 Task 1 调查结果，在 [vite.config.ts](file:///d:/G/github/signbridge/frontend/vite.config.ts) `optimizeDeps` 中新增 `include` 数组，列出需要预构建的重量级依赖（候选：`@tensorflow/tfjs`、`three`、`@pixiv/three-vrm`、`@react-three/fiber`、`@react-three/drei`、`@mediapipe/hands` 等，以实际扫描结果为准）
  - [x] SubTask 2.2: 删除 `frontend/node_modules/.vite` 后执行 `npm run dev`，验证冷启动时间下降且无 "new dependencies optimized, reloading" 刷新
  - [x] SubTask 2.3: 验证 dev server 功能正常（浏览器打开页面、路由切换、HMR 正常）

## 阶段三：修复首屏同步重 import（条件性，仅当 Task 1.4 发现时执行）

- [x] Task 3: 修复首屏同步引入的重量级模块（如调查发现）
  - [x] SubTask 3.1: 根据 Task 1.4 结论，将发现的同步重 import 改为动态 import 或 React.lazy
  - [x] SubTask 3.2: 验证 `npx tsc -b` exit 0，`npm run build` 首屏 chunk 体积下降

## 阶段四：验证与提交

- [x] Task 4: 全量验证并提交
  - [x] SubTask 4.1: `npx tsc -b` exit 0
  - [x] SubTask 4.2: `npm run lint` 无新增 error
  - [x] SubTask 4.3: `npm run test` 单元测试全部通过
  - [x] SubTask 4.4: `npm run build` 成功，首屏 chunk 不含 tfjs/three.js
  - [x] SubTask 4.5: `npm run dev` 冷启动时间对比修复前有改善
  - [x] SubTask 4.6: 更新 [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md) 记录修复
  - [x] SubTask 4.7: git commit（不 push，等用户决定）

# Task Dependencies

- Task 2 依赖 Task 1（include 列表由调查结果决定）
- Task 3 依赖 Task 1.4（仅当发现同步重 import 时执行）
- Task 4 依赖 Task 2 + Task 3（如执行）
- Task 1 为纯调查，不修改代码
