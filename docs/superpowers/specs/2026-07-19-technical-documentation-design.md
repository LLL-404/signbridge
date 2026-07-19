# 技术说明文档设计规格

## 目标

为 SignBridge 项目生成多文件分册型技术说明文档，目标读者兼顾大赛评委和开源社区开发者。

## 输出结构

```
docs/technical/
├── 01-architecture.md    # 系统架构总览
├── 02-avatar-module.md   # 虚拟人驱动模块
├── 03-recognition.md     # 手语识别管线
├── 04-grammar-engine.md  # 语法引擎
├── 05-data-layer.md      # 数据层
└── 06-dev-guide.md       # 开发指南
```

## 各册内容大纲

### 01-architecture.md — 系统架构总览

定位：评委3分钟能看懂全局，开发者作为导航入口。

1. 项目概览 — 一句话定位 + 核心功能表（语音转手语/手语识别/双向对话/手语学习）
2. 架构设计 — 微内核+插件化架构图（Kernel → PluginManager → 4插件），为什么选这个架构
3. 模块关系图 — 6大模块的依赖关系和数据流向（文字→语法引擎→虚拟人驱动→3D输出）
4. 技术栈选型 — React/Three.js/MediaPipe/TF.js/Zustand/IndexedDB 的选型理由
5. 关键设计决策 — 纯前端无后端、normalized bone、IK模式配置、表情代理对象等
6. 性能策略 — 分包策略（首屏55KB gzip）、PWA离线、VRM三级缓存
7. 部署架构 — GitHub Pages + GitHub Actions CI/CD

### 02-avatar-module.md — 虚拟人驱动模块

定位：技术深度最核心的一册，展示3D骨骼动画合成的完整实现。

1. 模块概览 — 文字→SignGloss→AnimationClip→AnimationMixer→VRM渲染的完整管线
2. ClipBuilder — 关键帧构建器核心逻辑，SignGloss枚举到骨骼旋转的映射
   - 手形系统（HandShape 18种 → FingerPose → VRM指骨旋转）
   - 手部位置（HandLocation 13区 → LOCATION_OFFSETS → IK目标点）
   - 运动轨迹（Movement 21种 → 起止关键帧插值，TAP正弦平滑）
   - 表情驱动（FacialExpression → expressionManager代理 → VRM blendShape）
   - IK求解（解析法/FABRIK/约束模式三选一）
3. IKSolver — FABRIK迭代求解器，收敛判定，SLERP旋转平滑
4. JointLimits — 铰链轴计算、A-pose退化处理、VRMC约束后处理
5. MotionPlayer — AnimationMixer生命周期管理，队列播放，过渡混合
6. TransitionEngine — 动作间过渡策略，淡入淡出
7. VRMAdapter — VRM模型加载、normalized bone API、expressionManager代理对象
8. VRMCache — 三级缓存（内存→IndexedDB→网络）
9. BodyVolume — 躯干体积建模，穿体检测与投影修正

### 03-recognition.md — 手语识别管线

定位：展示手语→文字的完整识别链路和AI能力。

1. 识别管线概览 — 摄像头帧→MediaPipe关键点→Worker线程→多识别器组合→结果融合
2. PoseEstimator — MediaPipe Hands 21关键点提取
3. Worker架构 — pose.worker + recognition.worker 双Worker设计
4. STGCNRecognizer — 时空图卷积网络，[30,126]→softmax
5. RuleRecognizer — 几何规则识别
6. CompositeRecognizer — 优先级组合策略
7. ConfidenceFilter — 置信度滤波
8. ContinuousRecognizer — 连续手语识别
9. 训练流水线 — TrainingDataGenerator → DataAugmentor → stgcn_train → 模型导出

### 04-grammar-engine.md — 语法引擎

定位：中文↔手语语序转换的核心智能。

1. 四阶段管线 — Tokenizer → Rewriter → GlossMapper → NonManualMarker
2. Tokenizer — FMM最大正向匹配分词
3. Rewriter — 手语语序调整规则（zhCSL规则包）
4. GlossMapper — 中文词→gloss_id映射
5. NonManualMarker — 非手动标记检测

### 05-data-layer.md — 数据层

定位：前端本地存储架构和数据管理。

1. 存储架构 — IndexedDB为主，PWA ServiceWorker为辅
2. VocabularyStore — 词汇库加载/查询/缓存
3. MotionDataStore — 动作数据存储
4. DataCollector — 用户数据采集
5. IndexedDBAdapter — IndexedDB异步操作封装
6. VRMCache — VRM模型三级缓存
7. validateVocabulary — 词汇数据校验
8. PWA缓存策略 — globPatterns、runtimeCaching、离线降级

### 06-dev-guide.md — 开发指南

定位：开发者上手和扩展的实用手册。

1. 环境搭建 — Node 24、npm install、.env配置
2. 开发命令 — dev/build/test/lint/e2e/graph
3. 项目结构 — 目录树 + 职责说明
4. 扩展插件 — 如何新增功能页面插件
5. 扩展手语词汇 — vocabulary.json格式 + 新增词条流程
6. 调试 — logger模块、StartupTracker、PerformancePanel
7. 测试 — vitest单元测试 + Playwright E2E
8. 部署 — GitHub Pages部署流程

## 写作原则

- 中文撰写，代码/类名/变量名保留英文
- 每册开头的"概览"部分面向评委，后续细节面向开发者
- 代码引用使用相对路径链接（file:/// 协议），便于在 IDE 中跳转
- 数据流用 Mermaid 图表呈现
- 避免过度赘述已废弃的旧方案，聚焦当前实现
- 每册篇幅控制在 200-400 行 Markdown

## 依赖

需要深入阅读以下源文件来提取技术细节：
- `frontend/src/modules/avatar/` 全部文件
- `frontend/src/modules/recognition/` 全部文件
- `frontend/src/modules/grammar/` 全部文件
- `frontend/src/modules/data/` 全部文件
- `frontend/src/kernel/` 全部文件
- `frontend/src/plugins/index.ts`
- `frontend/src/types/` 全部文件
- `frontend/src/config.ts`
- `frontend/vite.config.ts`
- `.github/workflows/` 全部文件
