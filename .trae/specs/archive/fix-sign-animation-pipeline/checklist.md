# Checklist

- [x] VoiceToSignPage 有可见的文本输入框，支持打字输入中文并回车提交
- [x] 空文本输入不触发任何转换和播放
- [x] 文本提交后 GrammarEngine.convert 被调用，生成 GlossSequence
- [x] GrammarEngine.convert 在分词阶段输出诊断日志（分词数量和结果）
- [x] GrammarEngine.convert 在映射阶段输出诊断日志（匹配数/总数、未匹配词）
- [x] AvatarDriver.playSequence 输出诊断日志（准备动作数、VRM 动作数、队列长度）
- [x] GrammarEngine.convert 在执行前等待 initializeVocabulary() 完成
- [x] 首次输入在数据加载完成前，UI 显示"加载数据中..."而非直接失败
- [x] AvatarDriver.finish() 仅在 VRM 轨道和 BonePose 轨道均完成时才执行
- [x] VRM 轨道完成后不跳回 NEUTRAL_VRM_POSE，保持最后一帧姿态
- [x] VoiceToSignPage 显示管道状态（就绪/转换中/播放中/错误）
- [x] 输入"你好"后 VRM 模型有可见的手部从胸前移动到面部高度的动作
- [x] 输入"再见"后 VRM 模型有可见的手部水平摆动动作
- [x] 输入不存在的词汇时 UI 显示未匹配提示
- [x] 浏览器控制台有完整的管道诊断日志输出
- [x] VS Code 诊断无新增 error/warning
