# 完整句子演示验证与时态助词补齐 Spec

## Why
用户需要一套完整的句子演示（如"我今天吃饭了"），验证当前文本→手语管线能否完整表示中文句子。初步调查发现：分词器、词汇库、序列播放管线已具备基础能力（"我/今天/吃饭"均在词汇库，playSequence 支持多词汇依次播放），但存在关键缺口——**时态助词"了/着/过"不在分词器 PARTICLES 词表中**，会被切成单字并作为未匹配词跳过，导致完成体/持续体/经历体语义完全丢失，用户看到"了"显示为未匹配词，不符合"完整表示"要求。

## What Changes
- 扩展 `Tokenizer` PARTICLES 词表，增加时态助词"了/着/过"并标注词性为 'u'（助词），使其不再作为未匹配单字
- `NonManualMarker` 增加时态/体（aspect）检测：完成体"了"→句末点头+表情放松；持续体"着"→表情持续；经历体"过"→头部微摇。检测优先级：疑问 > 否定 > 强调 > **时态** > 陈述
- `GlossMapper` 对时态助词（pos='u'）不再归入 unmatchedWords，而是静默跳过（其语义由 NonManualMarker 承载）
- 选定 6 个演示句子覆盖日常场景，端到端验证分词→映射→非手语标记→播放全链路
- 运行时验证：浏览器中输入每个句子，确认分词日志、映射日志、序列播放、非手语标记均正确

## Impact
- Affected specs: fix-daily-phrase-recognition（日常短语识别，本 spec 扩展到句子级时态处理）、expand-sign-vocabulary（词汇扩展，本 spec 不新增词汇只补时态助词策略）
- Affected code:
  - `frontend/src/modules/grammar/Tokenizer.ts`（PARTICLES 增加"了/着/过"）
  - `frontend/src/modules/grammar/NonManualMarker.ts`（增加时态/体检测与标记）
  - `frontend/src/modules/grammar/GlossMapper.ts`（时态助词不归入 unmatched）
- 不受影响：ClipBuilder、VRMAnimator、BodyVolume、JointLimits（本 spec 只改语法引擎层，不动动画管线）

## ADDED Requirements

### Requirement: 时态助词分词识别
系统 SHALL 在分词阶段正确识别时态助词"了/着/过"，标注词性为 'u'（助词），不再作为未匹配单字处理。

#### Scenario: "我今天吃饭了"分词结果
- **WHEN** 输入"我今天吃饭了"
- **THEN** 分词结果为 [我(r), 今天(n), 吃饭(v), 了(u)]
- **AND** "了"被标注为助词，不出现在 unmatched_words 中

### Requirement: 时态/体非手语标记
系统 SHALL 检测句子中的时态助词并附加对应的非手语标记：
- 完成体"了"（句末）→ 头部 slight_nod + 表情 relaxed
- 持续体"着"→ 表情 neutral（持续态，无强烈表情）
- 经历体"过"→ 头部 slight_shake（左右微摇表示曾经经历）
- 检测优先级：疑问 > 否定 > 强调 > 时态 > 陈述

#### Scenario: 完成体"了"触发句末点头
- **WHEN** 输入"我今天吃饭了"，"了"位于句末
- **THEN** sentence_non_manual 包含 head_movement: slight_nod, expression: relaxed
- **AND** 序列播放时虚拟人在最后一个词汇结束后执行点头动作

### Requirement: 演示句子端到端验证
系统 SHALL 支持以下 6 个演示句子的完整端到端播放，每个句子的所有实义词都能映射到手语词汇并依次播放：
1. 我今天吃饭了（时态助词+日常活动）
2. 你好朋友（问候+名词）
3. 谢谢老师（问候+称谓）
4. 我想喝水（代词+动词+名词）
5. 他明天来（代词+时间+动词）
6. 我们是学生（代词+系词+名词）

#### Scenario: 演示句子无未匹配实义词
- **WHEN** 输入上述 6 个句子中的任意一个
- **THEN** 除时态助词"了/着/过"外，所有实义词均映射到 gloss_id
- **AND** unmatched_words 仅可能包含时态助词（被 GlossMapper 静默跳过，不计入 unmatched）
- **AND** 序列依次播放每个词汇的 AnimationClip

## MODIFIED Requirements

### Requirement: 非手动标记检测
NonManualMarker 从"仅检测句子类型（疑问/否定/强调/陈述）"扩展为"同时检测时态/体"。时态检测基于句末助词"了/着/过"识别，优先级低于疑问/否定/强调，高于陈述。

### Requirement: 词汇映射未匹配处理
GlossMapper 对词性为 'u'（助词）的 token 不再归入 unmatchedWords，因其语义由 NonManualMarker 的非手语标记承载，无需映射到手语词汇。

## REMOVED Requirements
无
