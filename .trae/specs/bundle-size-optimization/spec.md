# SignBridge 包体积优化 - 产品需求文档

## Overview
- **Summary**: 针对 SignBridge 手语桥项目的包体积进行系统性优化，在保持功能完整性的前提下，进一步减小首屏加载体积，提升用户体验和 Web Vitals 评分。
- **Purpose**: 解决"包体积 vs 功能丰富性"的非对抗性矛盾，通过工程策略统筹兼顾两者，提升应用性能和用户留存率。
- **Target Users**: 所有使用 SignBridge 的用户，特别是移动端用户和网络环境较差的用户。

## Goals
- 将首屏 gzip 体积从 ~55KB 进一步优化到 < 45KB
- 将 LCP（最大内容绘制）从 < 1s 优化到 < 800ms
- 确保所有核心功能（翻译、学习、识别）正常运行
- 维持现有分包策略的灵活性和可维护性

## Non-Goals (Out of Scope)
- 不删除任何已实现的功能
- 不降低 3D 渲染质量
- 不减少 AI 识别精度
- 不重构核心业务逻辑

## Background & Context
- 当前项目使用 Vite + React + TypeScript 技术栈
- 已实现分包策略：react-vendor (~165KB), three-vendor (~833KB), tfjs-vendor (~1.6MB), mediapipe-vendor (~125KB), state-vendor (~4KB)
- 首屏 gzip 已从单体 622KB 降至 ~55KB
- 性能监控系统（usePerformanceMonitor）已就位，可用于验证优化效果
- 项目包含性能面板（PerformancePanel），支持 Ctrl+Shift+P 快捷查看

## Functional Requirements
- **FR-1**: 审查并优化 vite.config.ts 中的 manualChunks 配置
- **FR-2**: 优化第三方依赖的导入方式，确保按需加载
- **FR-3**: 评估并实施 Tree Shaking 优化
- **FR-4**: 优化静态资源（VRM 模型、词汇数据）的加载策略
- **FR-5**: 更新性能监控指标，增加包体积相关统计

## Non-Functional Requirements
- **NFR-1**: 首屏 gzip 体积 < 45KB
- **NFR-2**: LCP < 800ms
- **NFR-3**: FCP < 1.5s
- **NFR-4**: 代码改动不影响现有功能（回归测试通过）
- **NFR-5**: 优化过程需保持代码可维护性

## Constraints
- **Technical**: React 18 + TypeScript + Vite 5.x，需兼容现有技术栈
- **Business**: 不影响项目参加 TRAE AI 创造力大赛的展示效果
- **Dependencies**: 核心依赖（Three.js、TF.js、MediaPipe）不可替换

## Assumptions
- 现有分包策略是合理的，只需微调
- 用户网络环境为中等水平（4G/5G）
- 优化后功能行为与优化前一致

## Acceptance Criteria

### AC-1: 首屏包体积优化
- **Given**: 当前首屏 gzip 体积为 ~55KB
- **When**: 实施包体积优化策略
- **Then**: 首屏 gzip 体积应 < 45KB
- **Verification**: `programmatic` - 通过 Vite build 输出的 stats.json 验证

### AC-2: LCP 性能提升
- **Given**: 当前 LCP < 1s
- **When**: 实施优化策略
- **Then**: LCP 应 < 800ms
- **Verification**: `programmatic` - 通过 usePerformanceMonitor 收集的数据验证

### AC-3: 功能完整性验证
- **Given**: 所有核心功能（翻译、学习、识别）正常运行
- **When**: 应用包体积优化策略后
- **Then**: 所有功能应保持正常运行，无回归问题
- **Verification**: `programmatic` - 通过单元测试和集成测试验证

### AC-4: 静态资源加载优化
- **Given**: VRM 模型（~26MB）和词汇数据（~765词）需要加载
- **When**: 用户访问应用时
- **Then**: 静态资源应按需加载，不阻塞首屏渲染
- **Verification**: `human-judgment` - 通过浏览器开发者工具的网络面板验证

## Open Questions
- [ ] 是否需要引入代码分割分析工具（如 source-map-explorer）来精确定位体积热点？
- [ ] 是否可以使用更轻量的图标库替代现有方案？
- [ ] 是否需要考虑服务端渲染（SSR）来进一步优化首屏加载？