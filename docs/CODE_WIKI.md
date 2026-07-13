# SignBridge 手语桥 - Code Wiki

## 项目概述

| 项目名称 | SignBridge 手语桥 |
|---------|-------------------|
| 项目类型 | AI驱动的双向手语翻译系统 |
| 技术栈 | React 18 + TypeScript + Vite + Three.js + TensorFlow.js + MediaPipe |
| 当前阶段 | 开发阶段（核心功能已实现） |

**项目简介：** 手语桥（SignBridge）是一个AI驱动的双向手语翻译系统，旨在打破听障人士与健听人之间的沟通壁垒。

---

## 项目结构

```
/workspace/
├── frontend/                          # 前端项目（React + TypeScript + Vite）
│   ├── src/
│   │   ├── main.tsx                   # 应用入口
│   │   ├── App.tsx                    # 根组件
│   │   ├── config.ts                  # 环境配置
│   │   ├── routes.tsx                 # 路由配置（从插件管理器动态读取）
│   │   ├── vite-env.d.ts              # Vite 类型声明
│   │   │
│   │   ├── kernel/                    # 微内核（插件管理 + 事件总线）
│   │   │   ├── EventBus.ts            # 事件总线
│   │   │   ├── EventBus.test.ts
│   │   │   ├── PluginManager.ts       # 插件管理器
│   │   │   ├── PluginManager.test.ts
│   │   │   ├── types.ts               # 内核类型定义
│   │   │   └── index.ts               # 内核导出
│   │   │
│   │   ├── plugins/                   # 内置插件注册中心
│   │   │   └── index.ts
│   │   │
│   │   ├── components/                # UI组件
│   │   │   ├── layout/                # 布局组件
│   │   │   │   ├── Header.tsx         # 页头
│   │   │   │   ├── Sidebar.tsx        # 侧边栏
│   │   │   │   └── Layout.tsx         # 页面布局容器
│   │   │   ├── avatar/                # 虚拟人组件
│   │   │   │   ├── Avatar2D.tsx       # 2D虚拟人
│   │   │   │   ├── Avatar3D.tsx       # 3D虚拟人
│   │   │   │   ├── AvatarCanvas.tsx   # 虚拟人画布
│   │   │   │   ├── BoneController.ts  # 骨骼控制器
│   │   │   │   ├── VRMModel.tsx       # VRM模型组件
│   │   │   │   └── NonManualMarkerOverlay.tsx # 非手动标记覆盖层
│   │   │   ├── common/                # 通用组件
│   │   │   │   ├── ErrorBoundary.tsx  # 错误边界
│   │   │   │   └── PageHeader.tsx     # 页头组件
│   │   │   ├── debug/                 # 调试组件
│   │   │   │   └── PerformancePanel.tsx # 性能面板
│   │   │   ├── sign/                  # 手语识别组件
│   │   │   │   ├── SignCamera.tsx     # 手语摄像头
│   │   │   │   └── HandTracker.ts     # 手部追踪器
│   │   │   ├── voice/                 # 语音组件
│   │   │   │   └── VoiceInput.tsx     # 语音输入
│   │   │   └── learning/              # 学习组件
│   │   │       ├── AITutor.tsx         # AI陪练
│   │   │       ├── PracticeMode.tsx    # 练习模式
│   │   │       ├── ScoreFeedback.tsx   # 评分反馈
│   │   │       ├── WordSearch.tsx      # 词汇搜索
│   │   │       ├── DataCollectionPanel.tsx # 数据采集面板
│   │   │       └── DemoMode.tsx        # 演示模式
│   │   │
│   │   ├── pages/                     # 页面组件
│   │   │   ├── VoiceToSignPage.tsx     # 语音→手语页面
│   │   │   ├── SignToTextPage.tsx      # 手语→文字页面
│   │   │   ├── DialoguePage.tsx        # 对话页面
│   │   │   └── LearningPage.tsx        # 学习页面
│   │   │
│   │   ├── modules/                   # 核心业务模块
│   │   │   ├── avatar/               # 虚拟人驱动模块
│   │   │   │   ├── AvatarDriver.ts    # 虚拟人动作驱动引擎 ⭐
│   │   │   │   ├── AvatarDriver.test.ts
│   │   │   │   ├── AvatarDriver.motion.test.ts
│   │   │   │   ├── MotionPlayer.ts    # 动作播放器
│   │   │   │   ├── MotionPlayer.test.ts
│   │   │   │   ├── TransitionEngine.ts # 过渡动画引擎
│   │   │   │   ├── TransitionEngine.test.ts
│   │   │   │   ├── HandShape.ts       # 手形定义
│   │   │   │   ├── HandShape.vrm.test.ts
│   │   │   │   ├── IKSolver.ts        # 反向运动学求解器
│   │   │   │   ├── IKSolver.test.ts
│   │   │   │   ├── Retargeter.ts      # 重定向器
│   │   │   │   ├── Smoother.ts        # 平滑器
│   │   │   │   ├── VRMAdapter.ts      # VRM适配器
│   │   │   │   ├── VRMPoseAdapter.ts  # VRM姿态适配器
│   │   │   │   │   └── VRMPoseAdapter.test.ts
│   │   │   │   └── skeleton/          # 骨骼系统
│   │   │   │       ├── Skeleton3D.ts   # 3D骨骼
│   │   │   │       ├── Skeleton2D.ts   # 2D骨骼
│   │   │   │       └── joints.ts      # 关节定义
│   │   │   │
│   │   │   ├── grammar/              # 语法引擎模块 ⭐
│   │   │   │   ├── GrammarEngine.ts   # 语法引擎主类
│   │   │   │   ├── GrammarEngine.test.ts
│   │   │   │   ├── Tokenizer.ts       # 分词器
│   │   │   │   ├── Tokenizer.test.ts
│   │   │   │   ├── Rewriter.ts        # 语法重写器
│   │   │   │   ├── Rewriter.test.ts
│   │   │   │   ├── GlossMapper.ts     # 词汇映射器
│   │   │   │   ├── GlossMapper.test.ts
│   │   │   │   ├── NonManualMarker.ts # 非手动标记器
│   │   │   │   ├── NonManualMarker.test.ts
│   │   │   │   └── rules/            # 语法规则
│   │   │   │       ├── index.ts       # 规则导出
│   │   │   │       └── zhCSL.ts      # 中国手语规则
│   │   │   │
│   │   │   ├── recognition/          # 手语识别模块
│   │   │   │   ├── SignModel.ts       # TF.js LSTM模型 ⭐
│   │   │   │   ├── SequenceClassifier.ts # 序列分类器
│   │   │   │   ├── KeypointExtractor.ts # 关键点提取器
│   │   │   │   ├── Normalizer.ts      # 归一化器
│   │   │   │   ├── Normalizer.test.ts
│   │   │   │   ├── ConfidenceFilter.ts # 置信度过滤器
│   │   │   │   ├── ConfidenceFilter.test.ts
│   │   │   │   ├── ModelTrainer.ts    # 模型训练器
│   │   │   │   ├── TrainingDataGenerator.ts # 训练数据生成
│   │   │   │   ├── CompositeRecognizer.ts # 组合识别器
│   │   │   │   ├── ContinuousRecognizer.ts # 连续识别器
│   │   │   │   ├── DataAugmentor.ts   # 数据增强器
│   │   │   │   │   └── DataAugmentor.test.ts
│   │   │   │   ├── RuleRecognizer.ts  # 规则识别器
│   │   │   │   ├── Recognizer.ts      # 识别器接口
│   │   │   │   ├── WorkerRecognizer.ts # Worker识别器
│   │   │   │   ├── WorkerUtils.ts     # Worker工具
│   │   │   │   │   └── WorkerUtils.test.ts
│   │   │   │   └── recognition.worker.ts # Worker入口
│   │   │   │
│   │   │   ├── learning/             # 学习评分模块
│   │   │   │   ├── Scoring.ts         # 跟练评分 ⭐
│   │   │   │   ├── Scoring.test.ts
│   │   │   │   ├── DTW.ts            # DTW时间对齐
│   │   │   │   └── DTW.test.ts
│   │   │   │
│   │   │   └── data/                 # 数据存储模块
│   │   │       ├── BaseDataStore.ts  # 基础存储
│   │   │       ├── IndexedDBAdapter.ts # IndexedDB适配器
│   │   │       ├── VocabularyStore.ts # 词汇存储 ⭐
│   │   │       ├── MotionDataStore.ts # 动作数据存储
│   │   │       ├── DataInitializer.ts # 数据初始化
│   │   │       ├── CommonVocabulary.ts # 常用词汇
│   │   │       └── DataCollector.ts  # 数据采集器
│   │   │
│   │   ├── hooks/                    # React Hooks
│   │   │   ├── useAvatarPlayer.ts    # 虚拟人播放Hook
│   │   │   ├── useHandTracking.ts    # 手部追踪Hook
│   │   │   └── usePerformanceMonitor.ts # 性能监控Hook
│   │   │
│   │   ├── stores/                   # 状态管理（Zustand）
│   │   │   ├── appStore.ts           # 应用状态
│   │   │   └── avatarStore.ts       # 虚拟人状态
│   │   │
│   │   ├── types/                    # TypeScript类型定义
│   │   │   ├── avatar.ts            # 虚拟人类型
│   │   │   ├── grammar.ts            # 语法引擎类型
│   │   │   ├── sign.ts               # 手语类型
│   │   │   ├── recognition.ts       # 识别类型
│   │   │   └── index.ts              # 类型导出
│   │   │
│   │   ├── data/                     # 静态数据
│   │   │   └── demoScenarios.ts      # 演示场景数据
│   │   │
│   │   └── styles/                   # 样式
│   │       └── global.css            # 全局样式
│   │
│   ├── public/data/
│   │   └── vocabulary.json          # 手语词汇数据
│   │
│   ├── package.json                  # 依赖配置
│   ├── vite.config.ts               # Vite配置
│   └── tsconfig.json                # TypeScript配置
│
├── docs/                            # 项目文档
│   └── CODE_WIKI.md                 # 代码Wiki
├── start.bat                         # Windows启动脚本
├── start.ps1                         # PowerShell启动脚本
└── README.md                         # 项目说明
```

---

## 技术架构

### 技术栈概览

| 层级 | 技术选型 | 版本 | 用途 |
|------|---------|------|------|
| 框架 | React | 18.3.1 | UI框架 |
| 构建 | Vite | 5.4.8 | 开发服务器与构建 |
| 语言 | TypeScript | 5.6.2 | 类型安全 |
| 样式 | Tailwind CSS | 3.4.13 | 原子化CSS |
| 3D渲染 | Three.js + React Three Fiber | 0.169.0 | 3D虚拟人 |
| 手势检测 | MediaPipe Hands | 0.4.167 | 手部关键点检测 |
| 机器学习 | TensorFlow.js | 4.22.0 | 手语识别模型 |
| 状态管理 | Zustand | 4.5.5 | 轻量状态管理 |
| 路由 | React Router | 6.27.0 | 页面路由 |
| 数据存储 | IndexedDB | - | 本地持久化 |

### 系统数据流

```
┌─────────────────────────────────────────────────────────────────────────┐
│                          语音转手语流程                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  用户语音 ──→ Web Speech API ──→ 中文文本                               │
│                                        ↓                                │
│                              GrammarEngine                              │
│                         Tokenizer → Rewriter                            │
│                         → GlossMapper → NonManualMarker                 │
│                                        ↓                                │
│                           GlossSequence                                 │
│                                        ↓                                │
│                           AvatarDriver                                  │
│                         MotionPlayer → 骨骼动画                         │
│                                        ↓                                │
│                           3D虚拟人打手语                                 │
│                                                                         │
├─────────────────────────────────────────────────────────────────────────┤
│                          手语识别流程                                   │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  手语视频 ──→ MediaPipe Hands ──→ 21点关键点                            │
│                                        ↓                                │
│                        KeypointExtractor                                │
│                      运动检测 → 序列对齐                                │
│                                        ↓                                │
│                        SequenceClassifier                               │
│                        TF.js LSTM 分类                                 │
│                                        ↓                                │
│                        ConfidenceFilter                                │
│                           → 文字                                       │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 微内核架构

SignBridge 采用微内核架构，核心运行时（`kernel/`）只提供插件管理与事件总线两件基础设施，所有业务能力（语法、虚拟人、识别、学习、数据）都以插件形式注册并由 `routes.tsx` 动态读取后挂载到路由上。

### kernel/ 目录

| 文件 | 职责 |
|------|------|
| `EventBus.ts` | 事件总线，提供发布/订阅机制，解耦插件之间的通信 |
| `PluginManager.ts` | 插件管理器，负责插件的注册、依赖解析、生命周期（load/start/stop/unload）调度 |
| `types.ts` | 内核类型定义，包括 `Plugin`、`PluginManifest`、`PluginContext` 等接口 |
| `index.ts` | 内核统一导出，外部模块通过此入口消费 EventBus 与 PluginManager |
| `EventBus.test.ts` / `PluginManager.test.ts` | 内核单元测试 |

**EventBus.ts**

```typescript
export class EventBus {
  on(event: string, handler: EventHandler): () => void;   // 订阅，返回取消订阅函数
  off(event: string, handler: EventHandler): void;          // 取消订阅
  emit(event: string, payload?: unknown): void;             // 发布事件
  once(event: string, handler: EventHandler): () => void;   // 订阅一次
  clear(): void;                                             // 清空所有订阅
}
```

**PluginManager.ts**

```typescript
export class PluginManager {
  register(plugin: Plugin): void;                // 注册插件
  unregister(id: string): void;                  // 注销插件
  get<T>(id: string): T | undefined;             // 获取插件实例
  getActivePlugins(): Plugin[];                   // 当前已激活插件列表
  loadAll(context: PluginContext): Promise<void>; // 加载所有插件
  startAll(): Promise<void>;                      // 启动所有插件
  stopAll(): Promise<void>;                       // 停止所有插件
}
```

### plugins/ 目录

| 文件 | 职责 |
|------|------|
| `index.ts` | 内置插件注册中心，集中声明各业务模块（语法、虚拟人、识别、学习、数据）的插件清单并交由 `PluginManager` 统一注册 |

`routes.tsx` 在应用启动时调用 `plugins/index.ts` 获取已注册插件，依据每个插件声明的路由清单动态生成 React Router 配置，从而实现"按需挂载、可插拔"的页面与能力扩展。

---

## 主要模块职责

### 1. 虚拟人驱动模块 (`modules/avatar/`)

#### AvatarDriver.ts ⭐⭐⭐
**核心类** - 虚拟人动作驱动引擎

```typescript
export class AvatarDriver {
  private motionPlayer: MotionPlayer;
  private transitionEngine: TransitionEngine;
  private queue: MotionData[];      // 播放队列
  private speed: number;             // 播放速度

  // 核心方法
  playSequence(sequence: GlossSequence): Promise<void>;  // 播放词汇序列
  stop(): void;                      // 停止播放
  update(deltaTime: number): void;   // 每帧更新
  getCurrentPose(): BonePose;        // 获取当前姿态
  setSpeed(speed: number): void;     // 设置速度
}
```

**工作流程：**
1. 接收 `GlossSequence`（手语词汇序列）
2. 对每个词汇从 `MotionDataStore` 获取动作数据，不存在则根据 `SignGloss` 生成基础动作
3. 相邻词汇间使用 `TransitionEngine` 生成过渡动画
4. 附加非手动标记（表情、头势）
5. 交由 `MotionPlayer` 播放

#### MotionPlayer.ts
**动作播放器** - 负责单条动作数据的帧级播放控制

#### TransitionEngine.ts
**过渡动画引擎** - 在相邻动作间生成平滑过渡帧（线性插值）

#### HandShape.ts
**手形定义** - 15种中国手语常用手形的关节角度定义

#### Retargeter.ts
**重定向器** - 将统一描述的 `BonePose`/`HandPose` 重映射到具体运行时骨架（2D Canvas 骨架 / 3D Three.js 骨架 / VRM 骨骼），屏蔽不同渲染后端的骨骼命名差异

#### Smoother.ts
**平滑器** - 在帧与帧之间应用一阶低通滤波（指数滑动平均），消除抖动并降低高频噪声，输出稳定的姿态序列

#### VRMAdapter.ts
**VRM 适配器** - 负责加载与解析 VRM 模型（骨骼层级、BlendShape、表情），将 VRM humanoid 骨骼暴露为统一接口供 `Retargeter` 与 `Avatar3D` 使用

#### VRMPoseAdapter.ts
**VRM 姿态适配器** - 在 `Retargeter` 输出的通用姿态与 VRM 规范骨骼之间做双向转换，处理腕骨朝向、手指关节顺序、表情 BlendShape 权重等 VRM 专属约定

---

### 2. 语法引擎模块 (`modules/grammar/`)

#### GrammarEngine.ts ⭐⭐⭐
**核心类** - 中文到中国手语的语法转换引擎

```typescript
export class GrammarEngine {
  private tokenizer: Tokenizer;
  private rewriter: Rewriter;
  private glossMapper: GlossMapper;
  private nonManualMarker: NonManualMarker;

  // 核心方法
  async convert(text: string): Promise<GlossSequence>;  // 中文→手语序列
  setRulePack(pack: GrammarRulePack): void;             // 切换规则包
}
```

**处理流程（4阶段）：**

```
中文文本
   ↓
[阶段1] Tokenizer - 分词
   ↓
[阶段2] Rewriter - 语法重写（中文语序→CSL语序）
   ↓
[阶段3] GlossMapper - 中文词→gloss_id映射
   ↓
[阶段4] NonManualMarker - 非手动标记（表情/头势）
   ↓
GlossSequence（手语词汇序列）
```

#### Tokenizer.ts
**分词器** - 简单的基于正则的中文分词

#### Rewriter.ts
**语法重写器** - 将中文语序转换为中国手语（CSL）语序

**重写规则：**
| 规则 | 示例 | 说明 |
|------|------|------|
| 宾语前移 | "去医院" → "医院去" | 方向动词后名词前移 |
| 否定词后置 | "我不去" → "我去 不" | 否定词移到动词后 |
| 疑问词后置 | "你叫什么" → "你 叫 什么" | 疑问词移到句末 |
| 功能词去除 | "一个苹果" → "苹果" | 去除量词 |

#### GlossMapper.ts
**词汇映射器** - 中文词到gloss_id的映射查询

#### NonManualMarker.ts
**非手动标记器** - 检测句子类型并附加表情/头势

---

### 3. 手语识别模块 (`modules/recognition/`)

#### SignModel.ts ⭐⭐⭐
**TF.js LSTM 分类模型**

```typescript
export class SignModel {
  // 模型结构：[30, 126] → LSTM(128) → LSTM(64) → Dense(64) → Dropout(0.3) → Dense(numClasses, softmax)

  build(numClasses: number): tf.LayersModel;    // 构建模型
  async train(xData, yData, epochs): Promise<tf.History>;  // 训练
  async predict(sequence): Promise<number[]>;    // 推理
  async save(path): Promise<void>;               // 保存模型
  async load(path): Promise<void>;               // 加载模型
}
```

**模型规格：**
- 输入时间步：30帧
- 每帧特征：126维（双手21点×3坐标）
- 网络结构：双层LSTM + 全连接层
- 输出：softmax多分类

#### SequenceClassifier.ts
**序列分类器** - 封装模型推理逻辑

#### KeypointExtractor.ts
**关键点提取器** - 检测手部运动起止，提取有效序列

#### ConfidenceFilter.ts
**置信度过滤器** - 过滤低置信度结果

#### Normalizer.ts
**归一化器** - 关键点坐标归一化

#### Recognizer.ts
**识别器接口** - 定义统一的 `IRecognizer` 抽象（`init` / `recognize` / `dispose`），供 `SequenceClassifier`、`RuleRecognizer`、`WorkerRecognizer` 等不同实现遵循，便于上层组合与替换

#### CompositeRecognizer.ts
**组合识别器** - 将多个 `IRecognizer`（模型识别 + 规则识别 + Worker 识别）按优先级与置信度进行投票/级联融合，输出最终识别结果

#### ContinuousRecognizer.ts
**连续识别器** - 面向连续手语流场景，维护滑动窗口、自动切段、去重与上下文纠错，输出稳定词汇流

#### RuleRecognizer.ts
**规则识别器** - 基于关键点几何规则与手形模板的兜底识别器，在模型未覆盖或置信度不足时提供候选项

#### WorkerRecognizer.ts
**Worker 识别器** - 将模型推理任务封装到 Web Worker 中执行，避免阻塞主线程渲染，通过消息协议与主线程通信

#### WorkerUtils.ts
**Worker 工具** - 封装 Worker 的创建、消息序列化、Transferable 对象传输与错误处理，供 `WorkerRecognizer` 与 `recognition.worker.ts` 共用

#### recognition.worker.ts
**Worker 入口** - Web Worker 主线程脚本，加载 TF.js 模型并处理从主线程接收的关键点序列，返回识别结果

#### DataAugmentor.ts
**数据增强器** - 对训练关键点序列做随机抖动、时间缩放、镜像翻转等增强，扩充训练样本多样性

---

### 4. 学习评分模块 (`modules/learning/`)

#### Scoring.ts ⭐⭐⭐
**跟练评分算法**

```typescript
export class PracticeScorer {
  // 评分维度权重
  // 手形(40%) + 位置(40%) + 运动(20%)

  score(userKeypoints, standardKeypoints): PracticeScore;
  // 返回：总分、手形分、位置分、运动分、反馈、对齐帧
}

export function generateStandardKeypoints(gloss, frameCount): FrameKeypoints[];
```

**评分算法：**
1. **DTW时间对齐** - 用户动作与标准动作时间对齐
2. **手形相似度** - 指尖相对腕部向量的余弦相似度
3. **位置相似度** - 腕部绝对位置的归一化距离
4. **运动相似度** - 帧间位移向量的角度差

#### DTW.ts
**动态时间规整** - 时间序列对齐算法

---

### 5. 数据存储模块 (`modules/data/`)

#### VocabularyStore.ts ⭐⭐⭐
**词汇数据存储** - 基于IndexedDB的词汇查询

```typescript
export class VocabularyStore {
  async getById(gloss_id: string): Promise<SignGloss | null>;
  async getByChinese(chinese: string): Promise<SignGloss[]>;
  async getByCategory(category: string): Promise<SignGloss[]>;
  async search(query: string): Promise<SignGloss[]>;
  async getAll(): Promise<SignGloss[]>;
}
```

#### MotionDataStore.ts
**动作数据存储** - 存储预录动作数据

#### IndexedDBAdapter.ts
**IndexedDB适配器** - 封装IndexedDB CRUD操作

#### DataInitializer.ts
**数据初始化** - 应用启动时从JSON导入IDB

#### CommonVocabulary.ts
**常用词汇** - 内置的常用手语词汇清单（按场景/难度分组），用于词汇检索默认数据、学习模式推荐词表以及首次启动时的最小可用数据集

#### DataCollector.ts
**数据采集器** - 在用户授权下采集关键点序列与对应 gloss 标签，做格式校验与去重后写入 `MotionDataStore`，供 `ModelTrainer` 持续微调模型

---

## 关键类型定义

### avatar.ts
```typescript
interface Vec3 { x: number; y: number; z: number; }
interface JointPose { position: Vec3; rotation: Vec3; }
interface HandPose { shape: HandShape; location: HandLocation; palm_orientation: string; wrist: JointPose; fingers: [JointPose, JointPose, JointPose, JointPose, JointPose]; }
interface BonePose {
  root, spine, chest, neck, head: JointPose;
  left_shoulder, left_elbow, left_wrist: JointPose;
  right_shoulder, right_elbow, right_wrist: JointPose;
  left_hand, right_hand: HandPose;
  expression: FacialExpression; head_movement: HeadMovement;
}
interface Frame { pose: BonePose; timestamp: number; }
interface MotionData { gloss_id: string; frames: Frame[]; duration_ms: number; loop: boolean; }
```

### grammar.ts
```typescript
interface Token { word: string; pos: string; }
interface GlossSequenceItem { gloss_id: string; chinese: string; non_manual?: NonManualMark; }
interface GlossSequence { items: GlossSequenceItem[]; sentence_non_manual?: NonManualMark; }
```

### sign.ts
```typescript
enum HandShape { FLAT_B, V_SHAPE, FIST_A, OPEN_5, ... }  // 15种手形
enum HandLocation { NEUTRAL, CHEST_CENTER, FACE_LEVEL, ... }  // 14种位置
enum FacialExpression { NEUTRAL, HAPPY, SAD, QUESTION, ... }
enum HeadMovement { NONE, NOD, SHAKE, ... }

interface SignGloss {
  gloss_id: string; chinese: string; english?: string; category: string; difficulty: 1|2|3;
  manual: { handshape_start/end, location_start/end, movement, palm_orientation, is_two_handed, dominant_hand };
  non_manual: { expression, head_movement, body_movement? };
  duration_ms: number; source: string; keypoints?: number[][];
}
```

---

## 依赖关系

### package.json
```json
{
  "dependencies": {
    "@mediapipe/drawing_utils": "^0.3.1675466124",
    "@mediapipe/hands": "^0.4.1675469240",
    "@react-three/drei": "^9.114.0",
    "@react-three/fiber": "^8.17.10",
    "@tensorflow/tfjs": "^4.22.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "react-router-dom": "^6.27.0",
    "three": "^0.169.0",
    "zustand": "^4.5.5"
  }
}
```

### 模块依赖图
```
pages/VoiceToSignPage
├── components/voice/VoiceInput
├── components/avatar/AvatarCanvas
├── modules/grammar/GrammarEngine
│   ├── modules/grammar/Tokenizer
│   ├── modules/grammar/Rewriter
│   ├── modules/grammar/GlossMapper
│   └── modules/grammar/NonManualMarker
├── modules/avatar/AvatarDriver
│   ├── modules/avatar/MotionPlayer
│   ├── modules/avatar/TransitionEngine
│   ├── modules/avatar/HandShape
│   └── modules/data/VocabularyStore
└── stores/avatarStore

pages/SignToTextPage
├── components/sign/SignCamera
├── modules/recognition/KeypointExtractor
├── modules/recognition/SequenceClassifier
│   └── modules/recognition/SignModel (TF.js)
├── modules/recognition/ConfidenceFilter
└── modules/data/VocabularyStore
```

---

## 项目运行方式

### 环境要求
- Node.js 18+
- npm 9+

### 安装依赖
```bash
cd frontend
npm install
```

### 开发模式
```bash
npm run dev
# 访问 http://localhost:5173
```

### 构建生产版本
```bash
npm run build
```

### 代码检查
```bash
npm run lint
```

### Windows快速启动
```bash
start.bat
```

---

## 路由配置

| 路径 | 页面 | 功能 |
|------|------|------|
| `/` | → `/voice-to-sign` | 首页重定向 |
| `/voice-to-sign` | VoiceToSignPage | 语音转手语 |
| `/sign-to-text` | SignToTextPage | 手语识别 |
| `/dialogue` | DialoguePage | 双向对话 |
| `/learning` | LearningPage | 手语学习 |

---

## 状态管理

### appStore.ts
```typescript
interface AppState {
  vocabularyLoaded: boolean;
  setVocabularyLoaded: (loaded: boolean) => void;
}
```

### avatarStore.ts
```typescript
interface AvatarState {
  mode: '3d' | '2d';
  playbackSpeed: number;
  isPlaying: boolean;
  setMode: (mode: AvatarMode) => void;
  setPlaybackSpeed: (speed: number) => void;
  setIsPlaying: (playing: boolean) => void;
}
```

---

## 词汇数据格式

`vocabulary.json` 中的手语词汇条目：

```json
{
  "gloss_id": "hospital",
  "chinese": "医院",
  "english": "hospital",
  "category": "场所",
  "difficulty": 1,
  "manual": {
    "handshape_start": "flat_b",
    "handshape_end": "flat_b",
    "location_start": "chest_center",
    "location_end": "chest_center",
    "movement": "static",
    "palm_orientation": "inward",
    "is_two_handed": false,
    "dominant_hand": "right"
  },
  "non_manual": {
    "expression": "neutral",
    "head_movement": "none"
  },
  "duration_ms": 1000,
  "source": "CSL-dataset"
}
```

---

*文档生成时间：2026-07-11*
*项目版本：0.0.1*
