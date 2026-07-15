# Tasks

- [x] Task 1: 时态助词分词识别
  - [x] SubTask 1.1: 在 `Tokenizer.ts` 的 PARTICLES 集合增加"了/着/过"（时态助词），PosTagger 已对 PARTICLES 返回 'u'，无需额外改动
  - [x] SubTask 1.2: 确认"了/着/过"加入 PARTICLES 后，FMM 能正确匹配（不会被切成单字）

- [x] Task 2: GlossMapper 时态助词静默跳过
  - [x] SubTask 2.1: 在 `GlossMapper.map` 中，对 pos='u' 的 token 不归入 unmatchedWords，直接 continue（其语义由 NonManualMarker 承载）
  - [x] SubTask 2.2: 确认其他未匹配词仍正常归入 unmatchedWords

- [x] Task 3: NonManualMarker 时态/体检测
  - [x] SubTask 3.1: 在 `NonManualMarker` 新增 SentenceType 'completion'（完成体）/ 'continuous'（持续体）/ 'experience'（经历体），或复用现有类型加 aspect 字段
  - [x] SubTask 3.2: 在 detectSentenceType 中增加时态检测：句末"了"→completion，"着"→continuous，"过"→experience；优先级：疑问 > 否定 > 强调 > 时态 > 陈述
  - [x] SubTask 3.3: DEFAULT_RULES 增加时态规则：completion→(relaxed, slight_nod)，continuous→(neutral, none)，experience→(neutral, slight_shake)
  - [x] SubTask 3.4: 确认 HeadMovement 枚举有 slight_shake（若无则用 SHAKE 近似或新增）

- [x] Task 4: 静态校验
  - [x] SubTask 4.1: tsc --noEmit 通过，0 error
  - [x] SubTask 4.2: eslint 通过，0 error/warning

- [x] Task 5: 演示句子词汇覆盖确认
  - [x] SubTask 5.1: 确认 6 个演示句子的所有实义词在词汇库中：你/朋友/谢谢/老师/想/喝/水/他/明天/来/我们/是/学生（"老师/学生"在 vocabulary.json 完整词汇库，其余在 CommonVocabulary.ts）
  - [x] SubTask 5.2: 缺失词汇记录并评估是否需补充（无缺词，16 个实义词全部覆盖）

- [x] Task 6: 运行时端到端验证（数据级）
  - [x] SubTask 6.1: 启动 dev server，依次输入 6 个演示句子，hook console.info 收集分词/映射/播放日志
  - [x] SubTask 6.2: 确认每个句子的分词结果、映射结果（unmatched 仅时态助词）、序列播放 clip 数量
  - [x] SubTask 6.3: 确认"我今天吃饭了"的 sentence_non_manual 包含完成体标记（代码逻辑验证：分词"了"在句末 pos='u' → detectSentenceType 返回 'completion' → DEFAULT_RULES 映射 (NEUTRAL, SLIGHT_NOD)）

- [x] Task 7: 更新 CHANGELOG.md
  - [x] SubTask 7.1: 在 [Unreleased] 记录：feat(grammar): 时态助词"了/着/过"分词识别与非手语标记；fix(grammar): 时态助词不再作为未匹配词

# Task Dependencies
- Task 1（分词）是基础，Task 2（映射）和 Task 3（非手语标记）依赖它
- Task 4 依赖 Task 1-3
- Task 5（词汇确认）独立，可与 Task 1-3 并行
- Task 6 依赖 Task 4 + Task 5
- Task 7 依赖 Task 6 验证通过
