# 日常短语识别修复 Spec

## Why
用户输入日常短语「过来吃饭」时，系统仅识别出「来」「吃」两个词，「过」「饭」被归入未匹配词，导致手语动作语义残缺，用户感知为「识别不出来」。根因有二：
1. 词汇库缺失高频餐饮/趋向类词条（过来、吃饭、饭、喝、菜、饱等），现有词汇库虽含「吃」「来」「饿」「水」「去」，但餐饮场景覆盖严重不足。
2. 分词器（Tokenizer）的预定义动词词表不全，名词无统一词表，FMM 切分后部分单字仍无法在 GlossMapper 中查到 gloss_id。

本 spec 聚焦「文本→手语」管线的词汇识别环节，扩充餐饮/趋向类高频词条并补全分词器词表，使「过来吃饭」「喝水」「吃饱了」「去吃饭」等日常短语能完整识别。

## What Changes
- 词汇库（CommonVocabulary.ts）新增餐饮/趋向类高频词条：过来、吃饭、饭、喝、菜、饱、渴（共 7 个），每个词条的 movement 必须使用 ClipBuilder 已支持的 Movement 枚举 19 种之一，palm_orientation 必须使用 PalmOrientation 枚举 6 种之一，handshape/location/head_movement 必须使用现有合法枚举值。
- 分词器（Tokenizer.ts）VERBS 词表补全「过」「喝」等常用动词；新增常用名词词表（NOUNS）收录「饭、菜、水、东西、地方」等，用于词性标注与单字兜底切分时的词性识别。
- 不改动 ClipBuilder、GlossMapper、GrammarEngine 的接口；新增词条自动通过现有 FMM 词典构建（Tokenizer.ensureLoaded 会读取词汇库全部中文词）与 getByChinese 查询被消费。

## Impact
- Affected specs: fix-text-to-sign-pipeline（未匹配词提示逻辑复用，不修改）、fix-sign-movement-generation（ClipBuilder 已支持 19 种 movement，新词需对齐）
- Affected code:
  - `frontend/src/modules/data/CommonVocabulary.ts`（新增 7 个词条）
  - `frontend/src/modules/data/validateVocabulary.ts`（启动校验自动覆盖新词，无需改）
  - `frontend/src/modules/grammar/Tokenizer.ts`（VERBS 补全 + 新增 NOUNS 词表）
- 不受影响：ClipBuilder.ts、GlossMapper.ts、AvatarDriver.ts、VRMModel.tsx

## ADDED Requirements

### Requirement: 餐饮/趋向类高频词条
系统 SHALL 在 CommonVocabulary 中新增以下词条，每个词条字段完整且枚举值合法：
- 过来（趋向动词）
- 吃饭（动宾短语）
- 饭（名词）
- 喝（动词）
- 菜（名词）
- 饱（形容词）
- 渴（形容词）

#### Scenario: 词条枚举合法性
- **WHEN** 启动时 validateVocabulary 校验新增词条
- **THEN** 所有新词的 movement ∈ Movement 枚举 19 种、palm_orientation ∈ PalmOrientation 枚举 6 种、handshape ∈ HandShape 枚举、location ∈ HandLocation 枚举、expression ∈ FacialExpression 枚举、head_movement ∈ HeadMovement 枚举
- **AND** 校验通过，无错误日志

### Requirement: 日常短语完整识别
系统 SHALL 通过 FMM 分词 + GlossMapper 查询，完整识别下列短语，无未匹配词：
- 「过来吃饭」→ ["过来", "吃饭"]
- 「喝水」→ ["喝", "水"]
- 「吃饱了」→ ["吃", "饱", "了"]（「了」可未匹配，属语气词容忍范围）
- 「去吃饭」→ ["去", "吃饭"]

#### Scenario: 过来吃饭完整识别
- **WHEN** 用户在文本→手语输入框输入「过来吃饭」
- **THEN** Tokenizer 分词结果为 ["过来", "吃饭"]
- **AND** GlossMapper.map 返回 items 长度为 2，unmatchedWords 为空
- **AND** 虚拟人按顺序播放「过来」「吃饭」两个手语动作

#### Scenario: 未匹配词提示仍生效
- **WHEN** 用户输入词汇库完全不覆盖的内容（如「量子纠缠」）
- **THEN** unmatchedWords 正常收集并显示提示（复用现有逻辑，不回归）

### Requirement: 分词器词表补全
系统 SHALL 在 Tokenizer 中：
- VERBS 词表补全「过」「喝」
- 新增 NOUNS 词表，收录「饭、菜、水、东西、地方」等高频名词
- 词性标注器 PosTagger 识别 NOUNS 词表并标注词性 'n'

#### Scenario: 词性标注覆盖名词
- **WHEN** 分词器对「饭」单字切分时（若未命中词汇库长词）
- **THEN** PosTagger.tagWord("饭") 返回 'n'

## MODIFIED Requirements

### Requirement: 词汇库覆盖范围
CommonVocabulary 词汇库从 94 词扩充至 101 词，新增 7 个餐饮/趋向类词条，覆盖基本餐饮场景（吃/喝/饭/菜/水/饱/饿/渴）与趋向动作（来/过来/去）。

## REMOVED Requirements
无
