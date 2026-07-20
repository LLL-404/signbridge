# 解决构建遗留问题 Spec

## Why

最近一次环境验证（commit `a6fcfce`）暴露出两个构建链路遗留问题：

1. **依赖安装阻塞**：`npm install` 因 `@vitest/coverage-v8@^4.1.9` 与 `vitest@3.2.7` 主版本不兼容而失败，必须手动加 `--legacy-peer-deps` 才能继续。这违背"clone 后直接 `npm install` 即可"的开源协作约定，对大赛评委和新贡献者极不友好。
2. **构建循环依赖警告**：`vite build` 输出 `Circular chunk: tfjs-backend -> tfjs-other -> tfjs-backend`。虽然不阻塞产物生成，但循环 chunk 会导致 Rollup 在某些场景下无法树摇干净，并污染构建日志，掩盖真正的警告。

## What Changes

### 一、修复 vitest/coverage-v8 版本不匹配

- 将 `@vitest/coverage-v8` 主版本对齐到 `vitest` 当前主版本 3.x（推荐方案），或将 `vitest` 升级到 4.x（备选方案，需评估破坏性）
- 推荐方案：`@vitest/coverage-v8` 从 `^4.1.9` 降到 `^3.2.7`（与 `vitest@3.2.7` 完全对齐）
- 移除 `npm install --legacy-peer-deps` 的使用需求

### 二、修复 tfjs 循环 chunk 警告

- 分析 `@tensorflow/tfjs` meta-package 与子包（core/backend-webgl/converter）的依赖关系，找出循环路径
- 调整 [vite.config.ts](file:///d:/G/github/signbridge/frontend/vite.config.ts) `manualChunks` 中 tfjs 分组逻辑，消除循环
- 候选方案（实现阶段评估择优）：
  - 方案 A：把 `@tensorflow/tfjs` meta-package 单独分到 `tfjs-meta` chunk，与子包隔离
  - 方案 B：合并 `tfjs-other` 到 `tfjs-backend`（如果循环来自 backend ↔ meta）
  - 方案 C：合并所有 `@tensorflow/*` 到单一 `tfjs-vendor` chunk（最保守，但增大首屏体积）
- 保持按路由加载能力：手语识别页才加载 tfjs chunk

## Impact

- **Affected specs**: 
  - `loading-performance-optimization`（vendor 细分策略相关，需保持 chunk 拆分语义）
  - `bundle-size-optimization`（首屏体积约束相关）
- **Affected code**: 
  - [package.json](file:///d:/G/github/signbridge/frontend/package.json)（devDependencies 版本号）
  - [vite.config.ts](file:///d:/G/github/signbridge/frontend/vite.config.ts#L183-L195)（manualChunks tfjs 分组逻辑）
- **Affected docs**: 
  - [CHANGELOG.md](file:///d:/G/github/signbridge/CHANGELOG.md) 需记录修复
- **风险**: 
  - 降级 `@vitest/coverage-v8` 可能导致某些 v4 新增 API 不可用 → 经核查 `npm run test:coverage` 脚本仅用基础 coverage 命令，无 v4 专属 API
  - 调整 manualChunks 可能改变 chunk 体积分布 → 需重新验证首屏 gzip 体积不退化
  - 不改动业务代码，仅构建配置层修改

## ADDED Requirements

无（本次为修复现有问题，不新增功能）

## MODIFIED Requirements

### Requirement: 依赖安装可重现性

项目 SHALL 在不使用 `--legacy-peer-deps`、`--force` 等绕过参数的情况下，`npm install` 成功完成。

#### Scenario: 全新克隆后直接安装

- **WHEN** 在干净环境执行 `git clone` 后 `cd frontend && npm install`
- **THEN** exit code 0，无 ERESOLVE 错误，`node_modules/.bin/vitest` 可执行

#### Scenario: 覆盖率测试可用

- **WHEN** 执行 `npm run test:coverage`
- **THEN** vitest 覆盖率报告正常生成，覆盖率统计功能不退化

### Requirement: 构建无循环 chunk 警告

`vite build` SHALL 不输出 `Circular chunk` 警告。

#### Scenario: 生产构建日志干净

- **WHEN** 执行 `npm run build`
- **THEN** 构建日志中不出现 `Circular chunk` 字样，构建产物功能正常

#### Scenario: 首屏体积不退化

- **WHEN** 对比修复前后的 `vite build` 产物体积
- **THEN** 首屏 gzip 体积（react-vendor + state-vendor + 入口 chunk）变化幅度 ≤ 5%

## REMOVED Requirements

无
