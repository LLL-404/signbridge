# Checklist

- [x] DataInitializer.ts 已导入 logger 模块并创建 log 实例，错误路径不再崩溃
- [x] config.ts 中 vocabularyUrl 使用 import.meta.env.BASE_URL 拼接，兼容子路径部署
- [x] applyMovementOffset 函数正确处理 horizontal_line（左右偏移）和 vertical_line（上下偏移）
- [x] generateMotion（VRM 轨道）为 horizontal_line 和 vertical_line 生成 5 帧摆动关键帧
- [x] GlossMapper.map 返回未匹配词列表
- [x] GlossSequence 类型包含 unmatched_words 字段
- [x] VoiceToSignPage 在词汇未匹配时显示提示信息
- [x] DialoguePage 在词汇未匹配时显示提示信息
- [x] 当 GlossSequence.items 为空时 UI 显示"未识别到任何手语词汇"提示
- [x] 输入"你好"后虚拟人正确播放手语动作（端到端验证）
- [x] 输入"再见"后虚拟人手部在面部高度做左右摆动（horizontal_line 验证）
- [x] 输入词汇库中不存在的词时显示未匹配提示
- [x] VS Code 诊断无新增 error/warning
