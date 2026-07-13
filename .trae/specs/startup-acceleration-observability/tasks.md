# Tasks

- [x] Task 1: 统一日志模块 logger.ts
  - [x] SubTask 1.1: 新建 `frontend/src/modules/debug/logger.ts`，实现分级日志（debug/info/warn/error）
  - [x] SubTask 1.2: 实现模块前缀功能 `logger.module('Name')` 返回带前缀的子 logger
  - [x] SubTask 1.3: 实现 200 条 ring buffer 缓存，供调试面板读取
  - [x] SubTask 1.4: 根据环境自动设置日志级别（DEV=debug, PROD=warn）
  - [x] SubTask 1.5: 为 logger 编写单元测试

- [x] Task 2: StartupTracker 启动计时器
  - [x] SubTask 2.1: 新建 `frontend/src/modules/debug/StartupTracker.ts`，基于 `performance.mark/measure` 测量阶段耗时
  - [x] SubTask 2.2: 实现 `start(phase)` / `end(phase)` / `fail(phase, err)` API，每步输出结构化日志
  - [x] SubTask 2.3: 提供 `getReport()` 返回所有阶段耗时摘要
  - [x] SubTask 2.4: 为 StartupTracker 编写单元测试

- [x] Task 3: App 启动流程插桩 + 进度 UI
  - [x] SubTask 3.1: 在 App.tsx 中使用 StartupTracker 插桩插件注册/激活/词汇初始化/首次渲染
  - [x] SubTask 3.2: 改造 loading 界面，显示当前步骤名称和已用时间
  - [x] SubTask 3.3: 启动失败时在 loading 界面显示错误信息和重试按钮
  - [x] SubTask 3.4: 替换 App.tsx 中的 2 处 console.error 为 logger 调用

- [x] Task 4: 全项目 console 调用替换
  - [x] SubTask 4.1: 替换 `plugins/index.ts` 中的 console.error
  - [x] SubTask 4.2: 替换 `kernel/PluginManager.ts` 中的 3 处 console.error/warn
  - [x] SubTask 4.3: 替换 `modules/data/` 目录下 5 处 console.warn/error
  - [x] SubTask 4.4: 替换 `modules/recognition/` 目录下 25 处 console.*
  - [x] SubTask 4.5: 替换 `modules/avatar/` 目录下 console.*
  - [x] SubTask 4.6: 替换 `pages/` 目录下 6 处 console.*
  - [x] SubTask 4.7: 替换 `hooks/`、`components/` 目录下 4 处 console.*
  - [x] SubTask 4.8: 替换 `kernel/EventBus.ts` 中 1 处 console.error

- [x] Task 5: 页面级初始化插桩
  - [x] SubTask 5.1: 在 SignToTextPage 的 WorkerRecognizer 初始化流程中插桩
  - [x] SubTask 5.2: 在 VoiceToSignPage 的 VRM 模型加载流程中插桩
  - [x] SubTask 5.3: 在 DialoguePage 的初始化流程中插桩

# Task Dependencies

- Task 3 依赖 Task 1 + Task 2（App 插桩需要 logger 和 StartupTracker）
- Task 4 依赖 Task 1（console 替换需要 logger 模块）
- Task 5 依赖 Task 1 + Task 2（页面插桩需要 logger 和 StartupTracker）
- Task 4 与 Task 3/5 可并行（不同文件）
