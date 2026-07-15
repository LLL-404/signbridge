# Tasks

- [x] Task 1: 词汇库新增餐饮/趋向类高频词条
  - [x] SubTask 1.1: 在 CommonVocabulary.ts 新增 7 个词条：过来、吃饭、饭、喝、菜、饱、渴，gloss_id 按现有最大值递增（gloss_5xx 系列），每个词条字段完整（gloss_id/chinese/english/category/difficulty/manual/non_manual/duration_ms/source）
  - [x] SubTask 1.2: 确保每个新词的 movement ∈ Movement 枚举 19 种之一、palm_orientation ∈ PalmOrientation 6 种之一、handshape/location/expression/head_movement 均为合法枚举值；手形/位置/运动选择符合中国手语表达（如「过来」=OPEN_5 招手向身体 TOWARD_BODY；「吃饭」=O_SHAPE 嘴部 TAP_TWICE 或 STATIC；「喝」=C_SHAPE 嘴部 TOWARD_BODY；「饭」=O_SHAPE 嘴部 STATIC；「菜」=FLAT_B 平掌 STATIC；「饱」=手掌腹部 DOWNWARD；「渴」=食指嘴部 TAP）

- [x] Task 2: 分词器词表补全
  - [x] SubTask 2.1: 在 Tokenizer.ts 的 VERBS 集合补全「过」「喝」
  - [x] SubTask 2.2: 在 Tokenizer.ts 新增 NOUNS 集合，收录「饭、菜、水、东西、地方」等高频名词
  - [x] SubTask 2.3: 在 PosTagger.tagWord 中新增 NOUNS 判断分支，返回词性 'n'；在 isInWordList 中加入 NOUNS 判断

- [x] Task 3: 静态校验与启动校验
  - [x] SubTask 3.1: 运行 tsc --noEmit 与 eslint，确保 0 error/warning
  - [x] SubTask 3.2: 启动 dev server，确认 validateVocabulary 启动校验通过，无新词枚举非法错误

- [x] Task 4: 端到端识别验证
  - [x] SubTask 4.1: 输入「过来吃饭」，确认分词为 ["过来","吃饭"]，GlossMapper 全部匹配，虚拟人顺序播放两个动作
  - [x] SubTask 4.2: 输入「喝水」，确认分词为 ["喝","水"]，全部匹配并播放
  - [x] SubTask 4.3: 输入「去吃饭」，确认分词为 ["去","吃饭"]，全部匹配并播放
  - [x] SubTask 4.4: 输入词汇库不覆盖的词（如「量子」），确认 unmatchedWords 提示正常显示（不回归）

- [x] Task 5: 更新 CHANGELOG.md
  - [x] SubTask 5.1: 在 [Unreleased] 新增区块记录本次扩充（feat(data): 扩充餐饮/趋向类高频词条 7 个；fix(grammar): 分词器词表补全）

# Task Dependencies
- Task 2 独立，可与 Task 1 并行
- Task 3 依赖 Task 1 + Task 2
- Task 4 依赖 Task 3
- Task 5 依赖 Task 4 验证通过
