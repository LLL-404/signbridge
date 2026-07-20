# Tasks

## 阶段一：修复 vitest/coverage-v8 版本不匹配

- [x] Task 1: 对齐 @vitest/coverage-v8 到 vitest 主版本
  - [x] SubTask 1.1: 查阅 @vitest/coverage-v8 v3.x 最新版本号（与 vitest@3.2.7 对齐）
  - [x] SubTask 1.2: 修改 [package.json](file:///d:/G/github/signbridge/frontend/package.json#L50) 中 `@vitest/coverage-v8` 版本号
  - [x] SubTask 1.3: 删除 `node_modules` 和 `package-lock.json`，执行 `npm install`（不带 --legacy-peer-deps）验证
  - [x] SubTask 1.4: 执行 `npm run test:coverage` 验证覆盖率功能正常

## 阶段二：分析 tfjs 循环 chunk 根因

- [x] Task 2: 定位循环依赖路径
  - [x] SubTask 2.1: 在 [src/](file:///d:/G/github/signbridge/frontend/src/) 中 grep `@tensorflow/tfjs` 的 import 来源（meta-package vs 子包）
  - [x] SubTask 2.2: 检查 `@tensorflow/tfjs` meta-package 的 package.json，确认它是否 re-export `tfjs-backend-webgl`
  - [x] SubTask 2.3: 记录循环路径：哪两个 chunk 互相 import，import 的具体模块是什么

## 阶段三：修复 tfjs 循环 chunk 警告

- [x] Task 3: 调整 vite.config.ts manualChunks tfjs 分组逻辑
  - [x] SubTask 3.1: 根因分析选择方案（A/B/C 之一，见 spec）
  - [x] SubTask 3.2: 修改 [vite.config.ts](file:///d:/G/github/signbridge/frontend/vite.config.ts#L183-L195) 中 tfjs 分组代码
  - [x] SubTask 3.3: 执行 `npm run build` 验证日志无 `Circular chunk` 警告
  - [x] SubTask 3.4: 对比修复前后首屏 gzip 体积，确认 ≤ 5% 变化

## 阶段四：验收与提交

- [x] Task 4: 全量验证并提交
  - [x] SubTask 4.1: `npx tsc -b` 类型检查通过
  - [x] SubTask 4.2: `npm run lint` 通过
  - [x] SubTask 4.3: `npm run test` 单元测试全部通过
  - [x] SubTask 4.4: `npm run build` 构建成功且无循环警告
  - [x] SubTask 4.5: 更新 [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md) 记录修复
  - [x] SubTask 4.6: git commit（不 push，等用户决定）

# Task Dependencies

- Task 2 必须在 Task 3 之前完成（根因分析指导修复方案选择）
- Task 1 与 Task 2/3 相互独立，可并行
- Task 4 依赖 Task 1 + Task 3 全部完成
