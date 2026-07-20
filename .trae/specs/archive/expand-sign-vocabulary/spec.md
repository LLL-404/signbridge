# 扩充手语词汇并抽象动作规律规则 Spec

## Why

当前 `CommonVocabulary.ts` 仅含 25 个内置词汇，覆盖 10 个类别，无法满足基础对话需求。同时存在两类隐性缺陷：

1. **数据规范不一致**：词汇 `manual` 字段大量使用与 `sign.ts` 枚举值不匹配的字符串：
   - `handshape` 用 `'fist'`、`'index'`、`'flat'`、`'flat_O'`、`'hook'`，而枚举值为 `'fist_a'`、`'index_point'`、`'flat_b'`、`'o_shape'`，且 `'flat_O'`/`'hook'` 完全不存在于枚举
   - `movement` 用 `'wave'`、`'tap'`、`'tap_twice'`、`'forward'`、`'hook_together'`、`'wave_twist'`、`'side_to_side'`、`'none'`，而枚举中没有这些值（`'none'` 应为 `'static'`）
   - `location` 用 `'chest_level'`、`'side'`、`'forward'`，均不在 `HandLocation` 枚举
   - `expression` 用 `'focused'`、`HeadMovement` 用 `'tilt'`/`'slight_bow'`，均不在枚举

2. **缺乏规律抽象**：现有词汇是零散数据，未抽象出"手形-语义""位置-身体部位""运动-语义方向"等映射规则，导致后续新增词汇依赖人工经验，难以保证一致性。

## What Changes

### 一、扩充词汇库（25 → 90+ 条目）
按以下类别补充，每个新词汇必须使用合法枚举值：
- **日常问候**（+5）：早上好、晚上好、欢迎、请、晚安
- **代词**（+5）：我们、你们、他们、这、那
- **形容词**（+8）：坏、大、小、漂亮、热、冷、累、饿
- **动词**（+11）：去、来、看、听、说、做、想、买、卖、工作、休息
- **疑问词**（+4）：哪里、何时、为什么、多少
- **否定词**（+3）：没有、别、不要
- **名词**（+8）：家、学校、医院、食物、水、书、车、电话
- **情感**（+4）：生气、难过、惊讶、害怕
- **时间**（+5）：明天、昨天、现在、过去、未来
- **数字**（+10）：一至十（与 `HandShape.THREE`~`TEN` 对应）
- **颜色**（+6）：红、黄、蓝、绿、黑、白
- **专有名词**（+1）：中国

### 二、规范化现有 25 个词汇的字段值
将不符合枚举的字段统一替换为合法枚举值：
- `'fist'` → `'fist_a'`
- `'index'` → `'index_point'`
- `'flat'` → `'flat_b'`
- `'flat_O'` → `'o_shape'`
- `'hook'` → 新增 `HandShape.HOOK = 'hook'` 到枚举（因 `'hook'` 是中国手语常用手形，且现有词汇"朋友"使用）
- `'chest_level'` → `'chest_center'`
- `'side'` → `'shoulder_right'`（"他"指向侧方，用 `shoulder_right` 表达）
- `'forward'` → `'neutral'`（"帮助"的 forward 位置用 neutral 替代，运动用 `away_from_body` 表达）
- `'wave'` → 新增 `Movement.WAVE = 'wave'`
- `'tap'` → 新增 `Movement.TAP = 'tap'`
- `'tap_twice'` → 新增 `Movement.TAP_TWICE = 'tap_twice'`
- `'forward'`（运动） → 新增 `Movement.FORWARD = 'forward'`
- `'hook_together'` → 新增 `Movement.HOOK_TOGETHER = 'hook_together'`
- `'wave_twist'` → 新增 `Movement.WAVE_TWIST = 'wave_twist'`
- `'side_to_side'` → 新增 `Movement.SIDE_TO_SIDE = 'side_to_side'`
- `'none'`（运动） → `'static'`
- `'focused'` → `'neutral'`（暂无 focused 表情枚举，回退到 neutral）
- `'tilt'` → 新增 `HeadMovement.TILT = 'tilt'`（默认右倾，由动画驱动方向）
- `'slight_bow'` → 新增 `HeadMovement.SLIGHT_BOW = 'slight_bow'`

### 三、抽象动作规律规则
新增 `SignLanguageRules.ts`，沉淀以下规律：

1. **手形-语义映射表** `HANDSHAPE_SEMANTIC_MAP`：
   - `OPEN_5` → 开放/交流（问候、感谢、否定）
   - `FIST_A` → 确定/力量（是、学、对不起）
   - `INDEX_POINT` → 指代/指向（代词、疑问"谁"）
   - `THUMB_UP` → 评价（好）
   - `O_SHAPE` → 抓取/接触（吃、有、名字、开心）
   - `FLAT_B` → 承托/平移（帮助、今天）
   - `HOOK` → 勾连/关系（朋友）

2. **位置-身体部位映射表** `LOCATION_SEMANTIC_MAP`：
   - `CHEST_CENTER` → 自我/内心（我、是、有、对不起、爱）
   - `FACE_LEVEL` → 交流/认知（你好、再见、学、开心）
   - `CHIN_LEVEL` → 表达/言语（谢谢、谁）
   - `MOUTH_LEVEL` → 口部动作（吃）
   - `SHOULDER_RIGHT` → 他人/侧方（他）

3. **运动-语义方向映射表** `MOVEMENT_SEMANTIC_MAP`：
   - `UPWARD` → 积极/上升
   - `AWAY_FROM_BODY` → 外向传递
   - `HORIZONTAL_LINE` → 水平展示
   - `CIRCULAR` → 循环/反复
   - `WAVE` → 摇摆/否定
   - `TAP`/`TAP_TWICE` → 触碰强调
   - `STATIC` → 静止指代

4. **表情-情感映射表** `EXPRESSION_SEMANTIC_MAP`：
   - `HAPPY` → 问候/感谢/积极
   - `SAD` → 歉意/难过
   - `QUESTION` → 疑问
   - `NEUTRAL` → 中性陈述

5. **参数组合模板** `VOCABULARY_TEMPLATES`：
   - `PRONOUN_TEMPLATE`：`INDEX_POINT` + 对应位置 + `STATIC`
   - `GREETING_TEMPLATE`：`OPEN_5` + `FACE_LEVEL`/`CHEST_CENTER` + `UPWARD`/`AWAY_FROM_BODY` + `HAPPY`
   - `QUESTION_TEMPLATE`：任意手形 + `QUESTION` 表情 + `TILT` 头部
   - `NEGATION_TEMPLATE`：`OPEN_5`→`FIST_A` + `WAVE` + `OUTWARD` + `SHAKE`
   - `EMOTION_TEMPLATE`：双手 + 对应表情 + `STATIC`
   - `NUMBER_TEMPLATE`：对应数字手形 + `CHEST_LEVEL` + `STATIC`

### 四、添加词汇数据校验工具
新增 `validateVocabulary.ts`：
- `validateSignGloss(gloss)`：校验单个词汇字段是否合法
- `validateAllVocabulary()`：批量校验并输出非法字段报告
- 在开发环境启动时调用，发现非法字段输出 `logger.warn`

## Impact

- **Affected specs**：无直接相关 spec
- **Affected code**：
  - 修改：[sign.ts](file:///d:/G/github/signbridge/frontend/src/types/sign.ts)（新增枚举值）
  - 修改：[CommonVocabulary.ts](file:///d:/G/github/signbridge/frontend/src/modules/data/CommonVocabulary.ts)（规范化 25 个 + 新增 70 个）
  - 新增：`frontend/src/modules/data/SignLanguageRules.ts`
  - 新增：`frontend/src/modules/data/validateVocabulary.ts`
- **影响范围**：词汇数据是 SignBridge 的核心数据源，被 `ClipBuilder`、`AvatarDriver`、语法引擎、IndexedDB 加载流程消费。规范化字段值后，`ClipBuilder.parseHandShape` 等解析函数的回退分支将不再被触发，预期行为更稳定。

## ADDED Requirements

### Requirement: 词汇数据规范化

系统 SHALL 保证所有 `SignGloss.manual` 和 `SignGloss.non_manual` 字段值使用 `sign.ts` 中定义的合法枚举值，不允许出现未在枚举中声明的字符串。

#### Scenario: 词汇字段全部合法
- **WHEN** 调用 `validateSignGloss(gloss)` 校验一个字段全部合法的词汇
- **THEN** 返回 `{ valid: true, errors: [] }`

#### Scenario: 词汇字段存在非法值
- **WHEN** 调用 `validateSignGloss(gloss)` 校验一个 `handshape_start = 'fist'` 的词汇
- **THEN** 返回 `{ valid: false, errors: [{ field: 'manual.handshape_start', value: 'fist', expected: 'one of HandShape enum' }] }`

### Requirement: 词汇库覆盖基础对话需求

系统 SHALL 在 `CommonVocabulary.ts` 中提供至少 90 个内置词汇，覆盖 12 个类别（日常问候、代词、形容词、动词、疑问词、否定词、名词、情感、时间、数字、颜色、专有名词）。

#### Scenario: 词汇数量与类别覆盖
- **WHEN** 读取 `COMMON_VOCABULARY` 数组
- **THEN** 数组长度 ≥ 90
- **AND** 类别集合包含全部 12 个类别

### Requirement: 手语动作规律规则抽象

系统 SHALL 在 `SignLanguageRules.ts` 中提供手形、位置、运动、表情四类语义映射表，以及代词、问候、疑问、否定、情感、数字六类参数组合模板。

#### Scenario: 查询手形语义
- **WHEN** 调用 `HANDSHAPE_SEMANTIC_MAP[HandShape.INDEX_POINT]`
- **THEN** 返回 `['指代', '指向']` 语义标签数组

#### Scenario: 应用参数模板生成词汇
- **WHEN** 调用 `applyVocabularyTemplate('PRONOUN_TEMPLATE', { location: HandLocation.CHEST_CENTER })`
- **THEN** 返回包含 `handshape_start: 'index_point'`、`movement: 'static'`、`palm_orientation: 'inward'` 的 manual 对象

### Requirement: 开发环境数据校验

系统 SHALL 在开发环境启动时自动调用 `validateAllVocabulary()`，发现非法字段时通过 `logger.warn` 输出详细报告，但不阻塞启动。

#### Scenario: 开发环境校验通过
- **WHEN** 开发环境启动且所有词汇字段合法
- **THEN** 不输出任何 warning

#### Scenario: 开发环境发现非法字段
- **WHEN** 开发环境启动且存在 `handshape_start = 'fist'` 的词汇
- **THEN** logger 输出 `[validateVocabulary] 发现 N 个非法字段`，并列出每个非法字段的 `gloss_id`、`field`、`value`

## MODIFIED Requirements

### Requirement: HandShape 枚举

原 `HandShape` 枚举包含 16 个值（FLAT_B 至 TEN）。现新增 `HOOK = 'hook'`，共 17 个值，用于表示中国手语"勾连"手形（如"朋友"）。

## REMOVED Requirements

无。
