# Checklist

- [x] Tokenizer PARTICLES 增加"了/着/过"，PosTagger 对其返回 'u'（PARTICLES 检查提前到 VERBS 之前）
- [x] "我今天吃饭了"分词结果为 [我(r), 今天(n), 吃饭(v), 了(u)]，"了"不作为单字未匹配
- [x] GlossMapper 对 pos='u' 的 token 不归入 unmatchedWords
- [x] NonManualMarker 新增完成体/持续体/经历体检测
- [x] 完成体"了"→(neutral, slight_nod)，持续体"着"→(neutral, none)，经历体"过"→(neutral, shake)（HeadMovement 无 slight_shake，用 SHAKE 近似）
- [x] 时态检测优先级：疑问 > 否定 > 强调 > 时态 > 陈述
- [x] HeadMovement 枚举支持 slight_shake（无，用 SHAKE 近似）
- [x] tsc --noEmit 通过，0 error
- [x] eslint 通过，0 error/warning
- [x] 6 个演示句子实义词词汇覆盖确认（16 词全部覆盖，无缺词）
- [x] 运行时验证"我今天吃饭了"：分词日志含 了(u)，unmatched 不含"了"，3 clip 播放，穿模全 0
- [x] 运行时验证"你好朋友"：序列播放 2 个 clip，无未匹配，穿模全 0
- [x] 运行时验证"谢谢老师"：序列播放 2 个 clip，无未匹配（gloss_002 肘部穿入 1 已被修正系统投影到表面）
- [x] 运行时验证"我想喝水"：序列播放 4 个 clip，无未匹配（gloss_087 肘部穿入 1 已被修正系统投影到表面）
- [x] 运行时验证"他明天来"：序列播放 3 个 clip，无未匹配，穿模全 0
- [x] 运行时验证"我们是学生"：序列播放 3 个 clip，无未匹配，穿模全 0
- [x] CHANGELOG.md [Unreleased] 已记录时态助词处理
