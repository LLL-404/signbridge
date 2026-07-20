# 解决构建遗留问题验收清单

## 依赖安装可重现性

- [x] Checkpoint 1: 删除 `node_modules` 和 `package-lock.json` 后，`npm install`（无任何绕过参数）exit code 0
- [x] Checkpoint 2: `npm install` 日志中无 `ERESOLVE` 错误
- [x] Checkpoint 3: `node_modules/.bin/vitest` 文件存在且可执行
- [x] Checkpoint 4: `npm run test:coverage` 正常生成覆盖率报告，统计功能不退化

## 构建无循环 chunk 警告

- [x] Checkpoint 5: `npm run build` 日志中不出现 `Circular chunk` 字样
- [x] Checkpoint 6: 构建成功，所有 chunk 正常生成（含 tfjs-* chunk 或合并后的 tfjs chunk）
- [x] Checkpoint 7: 首屏 gzip 体积（react-vendor + state-vendor + 入口 index chunk）相比修复前变化 ≤ 5%
- [x] Checkpoint 8: 手语识别页（SignToTextPage）能正常加载 tfjs chunk，功能无回归

## 全量验证

- [x] Checkpoint 9: `npx tsc -b` 类型检查 exit 0
- [x] Checkpoint 10: `npm run lint` 无新增 error
- [x] Checkpoint 11: `npm run test` 单元测试全部通过（数量与修复前持平或增加）
- [x] Checkpoint 12: [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md) `[Unreleased]` 区段新增修复条目
- [x] Checkpoint 13: git commit 完成（不 push）
