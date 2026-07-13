# 启动加速与可观测性增强 Spec

## Why

应用启动时用户只看到一个"手语桥启动中..."的旋转图标，不知道卡在哪一步；页面级别初始化（MediaPipe WASM 加载、模型下载、VRM 加载）没有进度反馈和错误可见性；全项目 52 处 `console.*` 调用散落在 23 个文件中，无统一日志级别、无模块前缀、无时间戳，出问题时无法定位。

## What Changes

### 一、统一日志模块
- 新建 `frontend/src/modules/debug/logger.ts`，提供分级日志（debug/info/warn/error）和模块前缀
- 支持日志级别控制（开发环境 debug、生产环境 warn）
- 内置 ring buffer 缓存最近 200 条日志，供调试面板查看
- 替换项目中全部 52 处 `console.*` 调用为 logger 调用

### 二、启动计时器
- 新建 `frontend/src/modules/debug/StartupTracker.ts`，使用 `performance.mark/measure` 测量各阶段耗时
- 在 App 启动流程中插桩：插件注册 → 插件激活 → 词汇初始化 → 路由渲染
- 在页面初始化中插桩：模型加载 → Worker 初始化 → 摄像头启动
- 每个阶段开始/结束/失败时输出结构化日志

### 三、启动进度 UI
- 改造 App.tsx 的 loading 状态，显示当前启动步骤名称和耗时
- 启动失败时在 loading 界面直接显示错误信息（而非白屏或无限旋转）
- 在 DebugPanel 中新增"启动日志"tab，展示 StartupTracker 记录的时序

## Impact

- **Affected specs**: `enhance-pose-recognition`（PoseEstimator、KalidokitSolver 等模块的 console 调用将被替换）
- **Affected code**:
  - `frontend/src/modules/debug/` — 新增 `logger.ts`、`StartupTracker.ts`
  - `frontend/src/App.tsx` — 插桩 + 进度 UI
  - `frontend/src/plugins/index.ts` — 插件激活插桩
  - `frontend/src/modules/data/DataInitializer.ts` — 词汇初始化插桩
  - `frontend/src/modules/recognition/` — WorkerRecognizer、PoseEstimator、RuleRecognizer 等的 console 替换
  - `frontend/src/pages/SignToTextPage.tsx`、`VoiceToSignPage.tsx` — 页面初始化插桩
  - `frontend/src/kernel/PluginManager.ts` — console 替换
  - 其余 15+ 个含 `console.*` 的文件 — 批量替换
- **Breaking changes**: 无（logger 输出到 console，不影响现有行为）

## ADDED Requirements

### Requirement: 统一日志模块
系统 SHALL 提供分级日志模块 `logger`，支持 debug/info/warn/error 四个级别，每条日志自动附带时间戳、模块名前缀和级别标签。

#### Scenario: 开发环境详细日志
- **WHEN** 开发模式（`import.meta.env.DEV`）下运行
- **THEN** logger 默认级别为 `debug`，所有日志都输出到 console
- **AND** 每条日志格式为 `[HH:mm:ss.SSS] [LEVEL] [Module] message`

#### Scenario: 生产环境精简日志
- **WHEN** 生产模式下运行
- **THEN** logger 默认级别为 `warn`，仅 warn 和 error 输出到 console
- **AND** debug 和 info 级别日志静默

#### Scenario: 日志 ring buffer
- **WHEN** 任意级别的日志产生时
- **THEN** 日志同时写入一个 200 条容量的 ring buffer
- **AND** buffer 满时自动丢弃最旧的日志

#### Scenario: 模块化创建 logger
- **WHEN** 模块需要记录日志
- **THEN** 通过 `const log = logger.module('ModuleName')` 创建模块 logger
- **AND** 后续调用 `log.info('...')` 自动附加 `[ModuleName]` 前缀

### Requirement: 启动计时器
系统 SHALL 在关键启动阶段使用 `StartupTracker` 记录耗时，输出结构化日志，并在调试面板中可视化展示。

#### Scenario: App 启动计时
- **WHEN** App 组件开始初始化
- **THEN** StartupTracker 记录以下阶段：`plugins-register`、`plugins-activate`、`vocabulary-init`、`first-render`
- **AND** 每个阶段开始时输出 `info` 级别日志，完成时输出 `info` 级别日志（含耗时）
- **AND** 阶段失败时输出 `error` 级别日志（含错误信息）

#### Scenario: 页面初始化计时
- **WHEN** 用户导航到 SignToTextPage 或 VoiceToSignPage
- **THEN** StartupTracker 记录页面级初始化阶段（如 `signpage-model-load`、`signpage-worker-init`）
- **AND** 在页面 loading 状态中显示当前阶段名称

### Requirement: 启动进度 UI
App 的 loading 界面 SHALL 显示当前启动步骤名称和已用时间，启动失败时直接显示错误信息。

#### Scenario: 正常启动进度
- **WHEN** App 正在启动中
- **THEN** loading 界面显示当前步骤名称（如"正在激活插件..."、"正在加载词汇数据..."）
- **AND** 显示已用时间（秒）

#### Scenario: 启动失败可见
- **WHEN** 启动某步骤失败（如插件激活异常）
- **THEN** loading 界面显示错误信息和失败步骤名称
- **AND** 提供"重试"按钮（重新加载页面）

## MODIFIED Requirements

### Requirement: console 调用替换
项目中所有 `console.log/error/warn/info` 调用 SHALL 被替换为 logger 模块的对应方法调用。

#### Scenario: 批量替换
- **WHEN** 完成替换后
- **THEN** `frontend/src/` 目录中不再有裸 `console.*` 调用（允许 logger.ts 内部使用 console）
- **AND** 原有的错误处理行为不变（catch 中的 error 仍被记录）
