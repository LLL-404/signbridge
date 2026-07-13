# Checklist

## 统一日志模块

- [x] `logger.ts` 提供 debug/info/warn/error 四个级别方法
- [x] `logger.module('Name')` 返回带模块前缀的子 logger
- [x] 每条日志格式为 `[HH:mm:ss.SSS] [LEVEL] [Module] message`
- [x] 开发环境默认级别 debug，生产环境默认级别 warn
- [x] ring buffer 缓存最近 200 条日志，可通过 API 读取
- [x] logger 单元测试覆盖：各级别输出、模块前缀、ring buffer 溢出、级别过滤

## 启动计时器

- [x] `StartupTracker.ts` 提供 start/end/fail/getReport API
- [x] 使用 `performance.mark/measure` 记录阶段耗时
- [x] start 时输出 info 级别日志，end 时输出含耗时的 info 日志，fail 时输出 error 日志
- [x] getReport 返回所有阶段的名称、耗时、状态（success/failed/running）
- [x] StartupTracker 单元测试覆盖：正常计时、失败记录、并发阶段

## App 启动进度 UI

- [x] App.tsx loading 界面显示当前启动步骤名称
- [x] App.tsx loading 界面显示已用时间（秒）
- [x] 启动失败时 loading 界面显示错误信息
- [x] 启动失败时提供"重试"按钮（重新加载页面）
- [x] App.tsx 中无裸 console.* 调用

## console 调用替换

- [x] `frontend/src/` 目录中不再有裸 `console.log/error/warn/info` 调用（logger.ts 内部除外）
- [x] `plugins/index.ts` 中的 console.error 替换为 logger
- [x] `kernel/PluginManager.ts` 中的 3 处 console.* 替换为 logger
- [x] `kernel/EventBus.ts` 中的 console.error 替换为 logger
- [x] `modules/data/` 目录下 5 处 console.* 替换为 logger
- [x] `modules/recognition/` 目录下 25 处 console.* 替换为 logger
- [x] `modules/avatar/` 目录下 console.* 替换为 logger
- [x] `pages/` 目录下 6 处 console.* 替换为 logger
- [x] `hooks/` 和 `components/` 目录下 4 处 console.* 替换为 logger

## 页面级初始化插桩

- [x] SignToTextPage 的 WorkerRecognizer 初始化有 StartupTracker 插桩
- [x] VoiceToSignPage 的 VRM 模型加载有 StartupTracker 插桩
- [x] DialoguePage 的初始化流程有 StartupTracker 插桩
- [x] 页面 loading 状态显示当前初始化阶段名称
