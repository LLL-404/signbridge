# SignBridge 包体积优化 - 实施计划

## [x] Task 1: 分析当前包体积构成
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 使用 Vite 构建分析工具（rollup-plugin-visualizer）生成包体积分析报告
  - 识别首屏加载的体积热点和冗余依赖
  - 分析现有 manualChunks 配置的合理性
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: 生成可视化的包体积分析报告（stats.html）
  - `programmatic` TR-1.2: 识别出至少 3 个体积热点（每个 > 10KB）
- **Notes**: 需要安装 rollup-plugin-visualizer 依赖

## [x] Task 2: 优化 vite.config.ts 分包策略
- **Priority**: high
- **Depends On**: Task 1
- **Description**: 
  - 根据分析结果调整 manualChunks 配置
  - 将非首屏必要的代码移到异步加载的 chunk 中
  - 优化 React Fast Refresh 和其他开发插件的生产构建行为
- **Acceptance Criteria Addressed**: AC-1, AC-3
- **Test Requirements**:
  - `programmatic` TR-2.1: 重新构建后首屏 gzip 体积 < 45KB
  - `programmatic` TR-2.2: 单元测试全部通过（npx vitest run）
- **Notes**: 需要确保修改不影响现有功能

## [/] Task 3: 实施 Tree Shaking 优化
- **Priority**: medium
- **Depends On**: Task 1
- **Description**: 
  - 审查 TypeScript 配置（tsconfig.json）确保启用 ES modules
  - 检查第三方库的 sideEffects 配置
  - 移除未使用的导入和代码
- **Acceptance Criteria Addressed**: AC-1, AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: 构建产物中无未使用的代码（通过 visualizer 验证）
  - `programmatic` TR-3.2: 单元测试全部通过
- **Notes**: 需要注意某些库的 sideEffects 可能被错误标记

## [ ] Task 4: 优化静态资源加载策略
- **Priority**: medium
- **Depends On**: Task 1
- **Description**: 
  - 优化 VRM 模型的加载时机（用户交互后再加载）
  - 优化词汇数据的加载策略（NetworkFirst）
  - 评估是否可以压缩 VRM 模型
- **Acceptance Criteria Addressed**: AC-4, AC-2
- **Test Requirements**:
  - `human-judgment` TR-4.1: 首屏加载时不请求 VRM 模型
  - `programmatic` TR-4.2: 词汇数据使用 NetworkFirst 缓存策略
- **Notes**: 需要修改 App.tsx 和相关加载逻辑

## [ ] Task 5: 更新性能监控指标
- **Priority**: low
- **Depends On**: None
- **Description**: 
  - 在 usePerformanceMonitor 中增加包体积相关指标
  - 更新 PerformancePanel 显示新增的指标
  - 添加构建时间和 chunk 数量统计
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-5.1: PerformancePanel 显示首屏包体积和加载时间
  - `human-judgment` TR-5.2: 指标显示清晰、直观
- **Notes**: 需要确保新增指标不影响现有监控功能

## [ ] Task 6: 验证优化效果
- **Priority**: high
- **Depends On**: Task 2, Task 3, Task 4, Task 5
- **Description**: 
  - 运行完整的构建和测试流程
  - 使用 Lighthouse 进行性能评估
  - 验证 Web Vitals 指标是否达到目标
- **Acceptance Criteria Addressed**: AC-1, AC-2, AC-3, AC-4
- **Test Requirements**:
  - `programmatic` TR-6.1: Lighthouse 性能评分 > 90
  - `programmatic` TR-6.2: LCP < 800ms
  - `programmatic` TR-6.3: 所有单元测试和集成测试通过
- **Notes**: 需要在生产环境构建后进行验证