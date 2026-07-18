# SignBridge 加载性能优化 - 实施计划

## 子 Agent 任务划分

### 子 Agent A: vite.config + PWA 精简

## [x] Task A1: vendor manualChunks 细分
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 重构 `frontend/vite.config.ts` 的 `manualChunks` 函数
  - 拆分 `three-vendor` 为 `three-core` / `three-examples` / `three-vrm` / `react-three`
  - 拆分 `tfjs-vendor` 为 `tfjs-core` / `tfjs-backend` / `tfjs-converter` / `tfjs-other`
  - 保留 `react-vendor` / `mediapipe-vendor` / `state-vendor`
  - 移除 `vrm-module` / `recognition-module` / `grammar-module` / `data-module` / `learning-module`（让 Vite 默认按路由拆分）
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-A1.1: `npx vite build` 成功
  - `programmatic` TR-A1.2: stats.html 显示首屏不再包含 three-examples / three-vrm / tfjs-* chunk
- **Notes**: 注意 `three/build` 是 three.js 核心库路径，`three/examples/jsm` 是 GLTFLoader/FBXLoader 等附加模块

## [x] Task A2: PWA 预缓存精简
- **Priority**: high
- **Depends On**: Task A1
- **Description**:
  - `globPatterns` 从 `['**/*.{js,css,html,ico,png,svg,woff2,wasm}']` 改为 `['**/*.{js,css,html,ico,woff2}']`
  - `globIgnores` 新增 `**/models/*.vrm`、`**/pwa-*.png`（虽已通过 globPatterns 排除，但双保险）
  - 新增 `maximumFileSizeToCacheInBytes: 2 * 1024 * 1024`
  - 保留 runtimeCaching 配置不变
- **Acceptance Criteria Addressed**: AC-5
- **Test Requirements**:
  - `programmatic` TR-A2.1: 构建日志显示 precache 数量 < 30 条目，体积 < 1 MiB
- **Notes**: PNG/SVG 图标由浏览器 manifest 自动请求，运行时缓存即可

---

### 子 Agent B: 首屏关键路径瘦身

## [x] Task B1: main.tsx 动态化 validateVocabulary
- **Priority**: high
- **Depends On**: None
- **Description**:
  - `main.tsx` 移除同步 `import { runVocabularyValidationOnStartup }`
  - `runVocabularyValidationOnStartup` 移到 `App.tsx` 的 useEffect 中，仅 `import.meta.env.DEV` 时执行
  - 通过 `void import('@/modules/data/validateVocabulary').then(m => m.runVocabularyValidationOnStartup())` 动态加载
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-B1.1: `npx tsc -b` exit 0
  - `programmatic` TR-B1.2: `npx vitest run` 全部通过

## [ ] Task B2: App.tsx PerformancePanel 懒加载 + 启动骨架屏
- **Priority**: high
- **Depends On**: Task B1
- **Description**:
  - `App.tsx` 中 `PerformancePanel` 改为 `lazy(() => import('@/components/debug/PerformancePanel'))`
  - 仅在用户按下 Ctrl+Shift+P 时动态加载并渲染
  - 启动期 `pluginsReady=false` 的 loading UI 改为 `<Layout><PageSkeleton /></Layout>` 结构（保留侧边栏 + 顶部框架）
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-B2.1: `npx tsc -b` exit 0
  - `programmatic` TR-B2.2: `npx vitest run` 全部通过

## [ ] Task B3: 新增 PageSkeleton 通用骨架屏
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 新建 `frontend/src/components/common/PageSkeleton.tsx`
  - 复用 Layout 框架：左侧 Sidebar 占位 + 顶部 Header 占位 + 内容区骨架（pulse 动画）
  - 提供 `PageSkeleton` 默认导出
- **Acceptance Criteria Addressed**: AC-1, AC-2
- **Test Requirements**:
  - `programmatic` TR-B3.1: `npx tsc -b` exit 0
  - `human-judgment` TR-B3.2: 视觉验证骨架屏与实际页面布局一致

## [ ] Task B4: index.html critical CSS 内联
- **Priority**: medium
- **Depends On**: None
- **Description**:
  - 提取 dark theme 关键 CSS（背景色、字体、splash 样式）内联到 `<style>` 标签
  - 保留现有 splash 动画样式
  - 添加 `<meta name="theme-color" content="#0a0a0f">` 已存在，验证保留
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `human-judgment` TR-B4.1: 弱网下首次访问 splash 立即显示，背景色无闪烁

---

### 子 Agent C: 路由预加载

## [x] Task C1: Sidebar 菜单预加载
- **Priority**: high
- **Depends On**: None
- **Description**:
  - `Sidebar.tsx` 中菜单项添加 `onMouseEnter` / `onFocus` / `onTouchStart` 事件
  - 事件触发对应 `route.component()` 调用（预加载 chunk）
  - 触摸事件需节流（避免快速滑动触发多次）
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-C1.1: `npx tsc -b` exit 0
  - `human-judgment` TR-C1.2: DevTools Network 面板验证 hover 菜单时 chunk 预加载

## [ ] Task C2: routes.tsx 改用 PageSkeleton
- **Priority**: medium
- **Depends On**: Task B3
- **Description**:
  - `routes.tsx` 中 `RouteLoading` 组件改为引用 `PageSkeleton`
  - 移除本地 `RouteLoading` 定义
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-C2.1: `npx tsc -b` exit 0
  - `human-judgment` TR-C2.2: 路由切换时显示骨架屏而非 spinner

---

### 子 Agent D: VRM 分级加载 + 持久化

## [ ] Task D1: 新增 VRMCache.ts IndexedDB 持久化
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 新建 `frontend/src/modules/avatar/VRMCache.ts`
  - 提供 `loadVRM(url): Promise<VRM>` 统一接口
  - 加载优先级：内存缓存 → IndexedDB → HTTP
  - IndexedDB 存储 ArrayBuffer（key 为 URL，value 为 ArrayBuffer + timestamp）
  - 失败时 try-catch 回退到 HTTP 加载
  - 复用现有 `IndexedDBAdapter` 的 STORES 机制或新增 STORE
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-D1.1: `npx tsc -b` exit 0
  - `programmatic` TR-D1.2: 新增 VRMCache 单元测试覆盖 IDB 命中/未命中/失败回退

## [x] Task D2: VRMModel 改用 VRMCache
- **Priority**: high
- **Depends On**: Task D1
- **Description**:
  - `VRMModel.tsx` 中 `loadVRMCached` 改为调用 `VRMCache.loadVRM`
  - 保留 `vrmLoadCache` 内存缓存层（VRMCache 内部已实现）
  - 验证 StrictMode 双重渲染不重复加载
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-D2.1: `npx tsc -b` exit 0
  - `programmatic` TR-D2.2: `npx vitest run` 全部通过

## [ ] Task D3: Avatar3D skeleton 占位策略
- **Priority**: medium
- **Depends On**: Task D2
- **Description**:
  - `Avatar3D.tsx` 进入 VRM 模式时，VRM 加载完成前先渲染 `<SkeletonAvatarModel>` 占位
  - VRM 加载完成后切换到 `<VRMAvatarModel>`
  - 不引入额外低精度模型资源（用现有 skeleton 能力）
  - 添加 `lowPolyModelUrl` prop 接口（默认 undefined，预留扩展）
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-D3.1: `npx tsc -b` exit 0
  - `human-judgment` TR-D3.2: 进入 3D 页面 1 秒内看到 skeleton 占位，VRM 加载后切换

---

### 串行阶段: 交叉验证

## [x] Task E1: 全量验证
- **Priority**: high
- **Depends On**: Task A1, A2, B1, B2, B3, B4, C1, C2, D1, D2, D3
- **Description**:
  - `npx tsc -b` exit 0
  - `npx eslint .` 0 errors
  - `npx vitest run` 全部通过（809+，新增 VRMCache 测试）
  - `npx vite build` 成功，检查 stats.html chunk 分布
  - Lighthouse mobile 预设 LCP < 2500ms（手动）
- **Acceptance Criteria Addressed**: AC-1 ~ AC-6
- **Test Requirements**:
  - `programmatic` TR-E1.1: 所有命令退出码 0
  - `programmatic` TR-E1.2: stats.html 显示首屏 chunk 总体积下降 ≥ 30%
  - `programmatic` TR-E1.3: PWA 预缓存体积 < 1 MiB

## [ ] Task E2: 更新 CHANGELOG + 提交
- **Priority**: high
- **Depends On**: Task E1
- **Description**:
  - 更新 `CHANGELOG.md` [Unreleased] 部分
  - 分类记录：feat(perf) / chore(deps) 等
  - 提交并推送到 GitHub
- **Acceptance Criteria Addressed**: 项目硬约束
- **Test Requirements**:
  - `programmatic` TR-E2.1: git commit 成功
  - `programmatic` TR-E2.2: git push 成功
