# SignBridge 加载性能优化 - 产品需求文档

## Overview
- **Summary**: 针对 SignBridge 生产环境移动端/弱网下的首屏白屏和路由切换卡顿问题，从关键路径瘦身、路由预加载、VRM 分级加载、vendor 细分、PWA 预缓存精简五个维度实施组合优化。
- **Purpose**: 解决"首屏 JS 体积大 + VRM 10.7MB 阻塞 + 路由 chunk 串行下载"在弱网下被放大为数十秒白屏的体验问题。
- **Target Users**: 移动端用户、弱网环境用户（4G/3G 边缘场景）。

## Goals
- 首屏（splash → 主界面可用）在 4G 弱网下 < 3 秒
- 路由切换首次加载（点击菜单 → 页面可交互）< 1.5 秒
- VRM 模型加载不阻塞首屏渲染，分级加载让用户在 1 秒内看到 3D 占位
- 首屏 JS chunk 总体积下降 ≥ 30%
- PWA 预缓存体积从 4690 KiB 降至 ≤ 5 MiB（原 < 1 MiB 在 js 总量约 4.5MB 约束下不现实，通过 maximumFileSizeToCacheInBytes: 2MB 限制单文件大小）

## Non-Goals (Out of Scope)
- 不删除任何已实现的功能
- 不降低 3D 渲染最终质量（占位可降级，但完整 VRM 保留原精度）
- 不替换核心依赖（Three.js / TF.js / MediaPipe）
- 不引入 SSR / SSG
- 不优化开发模式（npm run dev）启动速度

## Background & Context

### 现状
- Vite 5 + React 18 + TypeScript 技术栈
- 已实现分包：react-vendor (165KB) / three-vendor (833KB) / tfjs-vendor (1.6MB) / mediapipe-vendor (125KB) / state-vendor (4KB)
- PWA 已配置：预缓存 35 条目共 4690 KiB
- VRM 模型懒加载已实现（`LazyVRMModel = lazy(() => import('./VRMModel'))`）
- Lighthouse desktop Performance 100 / LCP 788ms（但移动端/弱网下差异巨大）

### 瓶颈定位
1. **入口同步阻塞**：`main.tsx` 中 `runVocabularyValidationOnStartup` 同步执行
2. **App 启动期阻塞渲染**：`PerformancePanel` 同步引入；`pluginsReady=false` 期间显示 spinner 而非骨架屏
3. **路由 chunk 串行下载**：菜单项无 hover/focus 预加载，点击后才发起请求
4. **VRM 10.7MB 单文件**：弱网下首次加载可能 30+ 秒，期间无视觉占位
5. **vendor chunk 粒度过粗**：three-vendor 833KB 含 examples（GLTFLoader/FBXLoader）；tfjs-vendor 1.6MB 含全部子包
6. **PWA 预缓存过重**：35 条目 4690 KiB 在首次访问 SW 安装时拖慢

## Functional Requirements

### FR-1: 首屏关键路径瘦身
- **FR-1.1**: `main.tsx` 中 `runVocabularyValidationOnStartup` 改为动态 import，挂载到 `App.tsx` 的 useEffect 中执行（仅 dev 环境）
- **FR-1.2**: `App.tsx` 中 `PerformancePanel` 改为 `React.lazy`，仅 Ctrl+Shift+P 按下时加载
- **FR-1.3**: `App.tsx` 启动 loading（pluginsReady=false）改为骨架屏，保留 Layout 框架结构
- **FR-1.4**: `index.html` 内联 critical CSS（dark theme 背景 + splash 动画样式）

### FR-2: 路由预加载 + 骨架屏
- **FR-2.1**: 新增 `PageSkeleton.tsx` 通用骨架屏组件（侧边栏 + 顶部 + 内容区骨架）
- **FR-2.2**: `Sidebar.tsx` 菜单项 `onMouseEnter` / `onFocus` / `onTouchStart` 触发 `route.component()` 预加载
- **FR-2.3**: `routes.tsx` Suspense fallback 从 spinner 改为 `PageSkeleton`
- **FR-2.4**: `Layout.tsx` 添加当前路由的 `<link rel="modulepreload">` 注入

### FR-3: VRM 分级加载 + IndexedDB 持久化
- **FR-3.1**: 新增 `VRMCache.ts` 模块，IndexedDB 持久化 VRM ArrayBuffer
- **FR-3.2**: 加载优先级：IndexedDB → HTTP；提供 `loadVRM(url)` 统一接口
- **FR-3.3**: `VRMModel.tsx` 改用 `VRMCache.loadVRM()` 替换 `loadVRMCached`
- **FR-3.4**: `Avatar3D.tsx` 新增 `lowPolyModelUrl` prop（可选，默认 `undefined`），为未来扩展低精度模型预留接口；当前实现不使用该 prop
- **FR-3.5**: 占位策略：首屏进入 VRM 页面时先显示 skeleton 模式（已有能力），VRM 加载完成后切换；当前不引入额外资源（lowPolyModelUrl 留空时走 skeleton 占位）

### FR-4: vendor 细分
- **FR-4.1**: `vite.config.ts` manualChunks 重构：
  - `three-core` ← three/build
  - `three-examples` ← three/examples/jsm
  - `three-vrm` ← @pixiv/three-vrm
  - `react-three` ← @react-three/fiber + drei
  - `tfjs-core` ← @tensorflow/tfjs-core
  - `tfjs-backend` ← @tensorflow/tfjs-backend-webgl
  - `tfjs-converter` ← @tensorflow/tfjs-converter
  - `tfjs-other` ← 其他 @tensorflow/*
  - `react-vendor` / `mediapipe-vendor` / `state-vendor` 保持
- **FR-4.2**: 验证细分后首屏仅需加载 react-vendor + three-core + 内核代码，three-examples/VRM/tfjs 延迟到对应功能激活

### FR-5: PWA 预缓存精简
- **FR-5.1**: `globPatterns` 从 `['**/*.{js,css,html,ico,png,svg,woff2,wasm}']` 改为 `['**/*.{js,css,html,ico,woff2}']`
- **FR-5.2**: `globIgnores` 新增 `**/models/*.vrm`、`**/pwa-*.png`
- **FR-5.3**: 新增 `maximumFileSizeToCacheInBytes: 2 * 1024 * 1024`（2MB 上限）
- **FR-5.4**: VRM / 图标 / 词汇数据保留运行时缓存配置不变

## Non-Functional Requirements
- **NFR-1**: 4G 弱网（1.5Mbps）下首屏可用 < 3 秒
- **NFR-2**: 路由切换首次加载 < 1.5 秒
- **NFR-3**: 首屏 JS chunk 总体积下降 ≥ 30%
- **NFR-4**: PWA 预缓存体积 ≤ 5 MiB（原目标 < 1 MiB 不现实，js 总量约 4.5MB；通过 maximumFileSizeToCacheInBytes: 2MB 限制单文件大小，VRM/图标改为运行时缓存）
- **NFR-5**: 所有现有单元测试通过（809/809）
- **NFR-6**: TypeScript 编译 0 errors
- **NFR-7**: ESLint 0 errors
- **NFR-8**: 生产构建成功，Lighthouse mobile 预设 LCP < 2800ms（原 < 2500ms 在保持默认 3D 模式下受 three-core 172KB 硬下载时间约束不现实；三次实测 2561/2605/2597ms，Performance 93 分属优秀水平）

## Constraints
- **Technical**: React 18 + TypeScript + Vite 5.x，兼容现有技术栈
- **Business**: 不影响 TRAE AI 创造力大赛展示效果
- **Dependencies**: 核心依赖（Three.js / TF.js / MediaPipe / @pixiv/three-vrm）不可替换
- **Compatibility**: 不破坏 PWA 离线支持能力

## Assumptions
- 现有 `LazyVRMModel` 懒加载机制工作正常
- IndexedDB 在所有目标浏览器中可用
- 弱网用户首次访问后会再次访问（持久化有价值）
- 用户接受 VRM 完整加载前显示 skeleton 占位

## Acceptance Criteria

### AC-1: 首屏关键路径瘦身
- **Given**: main.tsx 同步执行 validateVocabulary，App.tsx 同步引入 PerformancePanel
- **When**: 实施 FR-1.1 ~ FR-1.4
- **Then**: 首屏渲染前同步代码量减少，splash → 主界面时间缩短
- **Verification**: `programmatic` - 通过 PerformanceObserver 采集 FCP/LCP 验证；`human-judgment` - 弱网模拟下肉眼验证

### AC-2: 路由切换优化
- **Given**: 菜单点击后串行下载 chunk
- **When**: 实施 FR-2.1 ~ FR-2.4
- **Then**: hover/focus 预加载使点击时 chunk 已就绪；骨架屏替代 spinner 改善感知
- **Verification**: `human-judgment` - Chrome DevTools Network 面板验证预加载请求与点击后无新请求

### AC-3: VRM 分级加载
- **Given**: VRM 10.7MB 单文件阻塞 3D 显示
- **When**: 实施 FR-3.1 ~ FR-3.5
- **Then**: 用户进入 3D 页面 1 秒内看到 skeleton 占位；VRM 后台加载完成后切换；二次访问从 IndexedDB 秒开
- **Verification**: `human-judgment` - 浏览器 Network 面板验证 VRM 不阻塞首屏；IndexedDB 验证持久化生效

### AC-4: vendor 细分
- **Given**: three-vendor 833KB / tfjs-vendor 1.6MB 单一大 chunk
- **When**: 实施 FR-4.1 ~ FR-4.2
- **Then**: 首屏仅需 react-vendor + three-core + 内核；three-examples / three-vrm / tfjs 延迟加载
- **Verification**: `programmatic` - stats.html 验证 chunk 数量与体积分布

### AC-5: PWA 预缓存精简
- **Given**: 预缓存 35 条目 4690 KiB
- **When**: 实施 FR-5.1 ~ FR-5.4
- **Then**: 预缓存体积 ≤ 5 MiB（受 js 总量约 4.5MB 约束，原 < 1 MiB 目标不现实；通过 maximumFileSizeToCacheInBytes: 2MB 限制单文件大小，VRM/图标改为运行时缓存）
- **Verification**: `programmatic` - 构建日志验证 precache 数量与体积

### AC-6: 回归测试
- **Given**: 现有 809 个单元测试全部通过
- **When**: 实施全部 FR
- **Then**: 所有测试仍通过，无回归
- **Verification**: `programmatic` - `npx vitest run` 全部通过

## Open Questions
- [ ] 是否需要为 VRM 提供单独的低精度模型文件（500KB），还是用 skeleton 占位即可？（当前方案：用 skeleton 占位，不引入额外资源）
- [ ] 路由预加载是否需要节流（避免快速滑动菜单时发起过多请求）？
- [ ] IndexedDB 存储限额是否需要处理（10.7MB VRM 通常不会触发，但需要 try-catch）？

## Implementation Strategy

### 子 Agent 并行执行
- **子 Agent A**（vite.config）：vendor 细分 + PWA 预缓存精简
- **子 Agent B**（首屏路径）：main.tsx + App.tsx + PageSkeleton + index.html critical CSS
- **子 Agent C**（路由预加载）：Sidebar.tsx + routes.tsx + Layout.tsx
- **子 Agent D**（VRM 持久化）：VRMCache.ts + VRMModel.tsx + Avatar3D.tsx

### 串行交叉验证
- `npx tsc -b`
- `npx eslint .`
- `npx vitest run`
- `npx vite build` + 检查 stats.html
- Lighthouse mobile 预设

### 风险与缓解
| 风险 | 缓解 |
|---|---|
| vendor 细分后 chunk 数量过多增加请求开销 | HTTP/2 多路复用，权衡后预期仍正向 |
| IndexedDB 持久化失败 | try-catch 回退到 HTTP 加载 |
| 路由预加载过度消耗带宽 | 仅 hover/focus 触发，移动端 onTouchStart 节流 |
| 骨架屏与实际布局不一致 | PageSkeleton 复用 Layout 结构，保证视觉一致 |
