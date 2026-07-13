# Tasks

- [x] Task 1: 添加文本输入入口到 VoiceToSignPage
  - [x] SubTask 1.1: 在 VoiceToSignPage 添加文本输入框和播放按钮，支持回车提交
  - [x] SubTask 1.2: 输入提交后调用 processSentence 触发 GrammarEngine 转换和 AvatarDriver 播放
  - [x] SubTask 1.3: 空输入不触发，输入框在播放时禁用

- [x] Task 2: 添加管道诊断日志到 GrammarEngine
  - [x] SubTask 2.1: 在 GrammarEngine.convert 各阶段（分词、重写、映射、非手动标记）输出 logger 日志
  - [x] SubTask 2.2: 日志包含分词结果数组、映射匹配数/总数、未匹配词列表、生成 items 数量
  - [x] SubTask 2.3: 在 AvatarDriver.playSequence 输出日志：准备的动作数、VRM 动作数、队列长度

- [x] Task 3: 修复数据加载竞态
  - [x] SubTask 3.1: 导出 initializeVocabulary 的 Promise，在 GrammarEngine.convert 开头 await 它
  - [x] SubTask 3.2: 在 VoiceToSignPage 显示数据加载状态（等待词汇数据就绪）

- [x] Task 4: 修复 AvatarDriver 双轨道时序同步
  - [x] SubTask 4.1: 修改 finish() 逻辑：仅在 vrmPlaying 和 playing 同时为 false 时才真正完成
  - [x] SubTask 4.2: VRM 轨道完成时不清除 vrmPlaying，改为保持最后一帧姿态，直到 finish() 被调用
  - [x] SubTask 4.3: BonePose 轨道完成时检查 VRM 轨道是否仍在播放，若是则等待

- [x] Task 5: 添加管道状态可视化
  - [x] SubTask 5.1: 添加 pipelineStatus 状态：'idle' | 'loading' | 'converting' | 'playing' | 'error'
  - [x] SubTask 5.2: 在 UI 中显示当前状态（文字 + 颜色指示器）
  - [x] SubTask 5.3: 错误状态显示具体错误信息

- [x] Task 6: 端到端验证
  - [x] SubTask 6.1: 验证输入"你好"后 VRM 模型有可见的手部从胸前移动到面部高度的动作
  - [x] SubTask 6.2: 验证输入"再见"后 VRM 模型有可见的手部水平摆动动作
  - [x] SubTask 6.3: 验证输入不存在词汇时显示未匹配提示
  - [x] SubTask 6.4: 验证浏览器控制台有管道诊断日志输出
  - [x] SubTask 6.5: 验证 VS Code 诊断无新增 error/warning

# Task Dependencies
- Task 3 独立，优先执行（解决数据竞态是其他任务的基础）
- Task 2 依赖 Task 3（日志需要在数据加载保证的基础上才有意义）
- Task 1 独立，可与 Task 2/3 并行
- Task 4 独立，可与 Task 1/2/3 并行
- Task 5 依赖 Task 1 和 Task 2（状态可视化需要文本输入和日志支持）
- Task 6 依赖所有前置任务完成
