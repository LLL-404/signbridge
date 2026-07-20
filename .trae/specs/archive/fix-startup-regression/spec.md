# 修复启动性能回归 Spec

## Why

用户反馈：项目启动变慢了，"之前挺快来着"。经澄清，**dev server 启动慢** + **浏览器首屏加载慢** 同时出现。

项目在 `loading-performance-optimization` spec 中已完成首轮加载性能优化（Lighthouse mobile LCP 实测 2561ms，20 项 checkpoint 全通过）。但此后 `f3da23a feat: 新增姿态驱动和识别模块` 引入了 `@tensorflow/tfjs`（meta-package，含 core/backend-webgl/converter/layers/data/backend-cpu 等子包）、STGCNRecognizer、PoseEstimator 等重量级模块，疑似导致：

1. **dev server 冷启动慢**：Vite `optimizeDeps` 未显式 `include` 重量级依赖，首次启动需"发现新依赖 → esbuild 预构建 → 页面刷新"，tfjs 大依赖图导致该过程耗时显著增加
2. **浏览器首屏加载慢**：某条同步 import 链可能将重量级模块拉入首屏 chunk，或 Vite dev 模式下首屏路由编译时触发了大量按需编译

## What Changes

### 一、定位回归根因

- 用 `git bisect` 或 commit 对比法定位引入回归的具体 commit
- 检查 `npm run dev` 冷启动日志（"ready in xxxms"、"new dependencies optimized" 出现频率）
- 检查生产 build 的 `dist/stats.html` chunk 体积分布，确认首屏 chunk 是否包含 tfjs/three.js
- 排查首屏默认路由 `/voice-to-sign` 的同步 import 链是否引入了重量级模块

### 二、优化 Vite dev server 预构建

- 在 [vite.config.ts](file:///d:/G/github/signbridge/frontend/vite.config.ts) `optimizeDeps.include` 中显式列出重量级依赖（`@tensorflow/tfjs`、`three`、`@pixiv/three-vrm`、`@react-three/fiber` 等），让 Vite 首次启动即预构建，避免运行时"发现新依赖 → 重新预构建 → 页面刷新"
- 评估是否需要调整 `optimizeDeps.esbuildOptions`（如 target、jsx）

### 三、修复首屏同步重 import（如调查发现）

- 如调查发现首屏同步引入了 tfjs/three.js 等重模块，改为动态 import 或 React.lazy
- 保持现有 lazy 加载语义：页面组件、PerformancePanel 已 lazy，不破坏现有模式

## Impact

- **Affected specs**:
  - `loading-performance-optimization`（首轮优化成果，需确认不退化）
  - `resolve-build-legacy-issues`（刚修复的 vite.config.ts manualChunks，本次只动 optimizeDeps 不动 manualChunks）
- **Affected code**:
  - [vite.config.ts](file:///d:/G/github/signbridge/frontend/vite.config.ts)（optimizeDeps.include）
  - 可能的页面/组件（取决于调查结果，如有同步重 import 则改为 lazy）
- **风险**:
  - `optimizeDeps.include` 列错模块名会导致预构建失败 → 需以 `npm run dev` 实测验证
  - 改动页面 import 结构需确保 lazy 语义正确 → 需全量测试通过

## ADDED Requirements

无（本次为修复回归，不新增功能）

## MODIFIED Requirements

### Requirement: Vite dev server 冷启动性能

项目 SHALL 在干净环境（删除 `node_modules/.vite`）下 `npm run dev` 冷启动，"ready in xxxms" 在合理时间内（≤ 3000ms，参考首轮优化前后的基线）。

#### Scenario: 首次冷启动

- **WHEN** 删除 `frontend/node_modules/.vite` 后执行 `npm run dev`
- **THEN** "ready in xxxms" ≤ 3000ms，且浏览器首次打开页面后不出现 "new dependencies optimized, reloading" 刷新

#### Scenario: 热启动（二次启动）

- **WHEN** 不删除 `.vite` 缓存，再次执行 `npm run dev`
- **THEN** "ready in xxxms" ≤ 1000ms（缓存命中）

### Requirement: 浏览器首屏加载性能不退化

首屏（默认路由 `/voice-to-sign`）加载性能 SHALL 不差于 `loading-performance-optimization` 的基线（Lighthouse mobile LCP < 2800ms）。

#### Scenario: 首屏 chunk 不含重量级模块

- **WHEN** 检查 `npm run build` 产出的首屏 chunk（react-vendor + state-vendor + 入口 index + Layout 相关）
- **THEN** 不包含 `@tensorflow/*`、`three/*`、`@pixiv/three-vrm` 等重量级模块（这些应在路由级 lazy chunk 中）

## REMOVED Requirements

无
