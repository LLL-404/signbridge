# Tasks

- [x] Task 1: 扩展 `sign.ts` 枚举定义
  - [x] SubTask 1.1: 在 `HandShape` 枚举中新增 `HOOK = 'hook'`
  - [x] SubTask 1.2: 在 `Movement` 枚举中新增 `WAVE`、`TAP`、`TAP_TWICE`、`FORWARD`、`HOOK_TOGETHER`、`WAVE_TWIST`、`SIDE_TO_SIDE`
  - [x] SubTask 1.3: 在 `HeadMovement` 枚举中新增 `TILT`、`SLIGHT_BOW`
  - [x] SubTask 1.4: 运行 `tsc --noEmit` 确认无类型错误

- [x] Task 2: 规范化现有词汇的字段值（实际 24 个）
  - [x] SubTask 2.1: 替换 `handshape` 非法字符串（`'fist'`→`'fist_a'`、`'index'`→`'index_point'`、`'flat'`→`'flat_b'`、`'flat_O'`→`'o_shape'`）
  - [x] SubTask 2.2: 替换 `movement` 非法字符串（`'none'`→`'static'`，其他新增枚举后即合法）
  - [x] SubTask 2.3: 替换 `location` 非法字符串（`'chest_level'`→`'chest_center'`、`'side'`→`'shoulder_right'`、`'forward'`→`'neutral'`）
  - [x] SubTask 2.4: 替换 `expression` 非法字符串（`'focused'`→`'neutral'`）
  - [x] SubTask 2.5: 替换 `palm_orientation` 非法字符串（`'sideward'`→`'rightward'`）

- [x] Task 3: 新增 70 个词汇到 `CommonVocabulary.ts`
  - [x] SubTask 3.1: 日常问候 +5（早上好、晚上好、欢迎、请、晚安）
  - [x] SubTask 3.2: 代词 +5（我们、你们、他们、这、那）
  - [x] SubTask 3.3: 形容词 +8（坏、大、小、漂亮、热、冷、累、饿）
  - [x] SubTask 3.4: 动词 +11（去、来、看、听、说、做、想、买、卖、工作、休息）
  - [x] SubTask 3.5: 疑问词 +4（哪里、何时、为什么、多少）
  - [x] SubTask 3.6: 否定词 +3（没有、别、不要）
  - [x] SubTask 3.7: 名词 +8（家、学校、医院、食物、水、书、车、电话）
  - [x] SubTask 3.8: 情感 +4（生气、难过、惊讶、害怕）
  - [x] SubTask 3.9: 时间 +5（明天、昨天、现在、过去、未来）
  - [x] SubTask 3.10: 数字 +10（一至十，对应 `HandShape.THREE`~`TEN`，1/2 用 `INDEX_POINT`/`V_SHAPE`）
  - [x] SubTask 3.11: 颜色 +6（红、黄、蓝、绿、黑、白）
  - [x] SubTask 3.12: 专有名词 +1（中国）

- [x] Task 4: 新增 `SignLanguageRules.ts` 规律规则文件
  - [x] SubTask 4.1: 实现 `HANDSHAPE_SEMANTIC_MAP`（17 个手形 → 语义标签数组）
  - [x] SubTask 4.2: 实现 `LOCATION_SEMANTIC_MAP`（13 个位置 → 语义标签数组）
  - [x] SubTask 4.3: 实现 `MOVEMENT_SEMANTIC_MAP`（20 个运动 → 语义标签数组）
  - [x] SubTask 4.4: 实现 `EXPRESSION_SEMANTIC_MAP`（9 个表情 → 语义标签数组）
  - [x] SubTask 4.5: 实现 `VOCABULARY_TEMPLATES`（6 类参数组合模板）和 `applyVocabularyTemplate` 函数
  - [x] SubTask 4.6: 为每个映射表添加中文注释说明规律来源

- [x] Task 5: 新增 `validateVocabulary.ts` 校验工具
  - [x] SubTask 5.1: 实现 `validateSignGloss(gloss): { valid: boolean; errors: ValidationError[] }`
  - [x] SubTask 5.2: 实现 `validateAllVocabulary(): ValidationResult`（遍历 `COMMON_VOCABULARY`）
  - [x] SubTask 5.3: 在开发环境启动流程中调用 `runVocabularyValidationOnStartup()`，发现非法字段时 `logger.warn` 输出报告

- [x] Task 6: 更新 `HandShape.ts` 补充 `HOOK` 手形定义
  - [x] SubTask 6.1: 在 `HAND_SHAPE_DEFINITIONS` 中新增 `HOOK` 手形（食指弯曲，其余屈曲，用于"勾连"动作）
  - [x] SubTask 6.2: 运行 `tsc --noEmit` 确认无类型错误

- [x] Task 7: 更新 CHANGELOG.md
  - [x] SubTask 7.1: 在 `[Unreleased]` 的 `新增` 分类下记录：扩充词汇库至 94 条目、新增 SignLanguageRules 规律规则、新增词汇校验工具、扩展枚举
  - [x] SubTask 7.2: 在 `[Unreleased]` 的 `修复` 分类下记录：规范化现有词汇字段值、修复 NonManualMarkerOverlay 回归、清理 3 个预存 tsc 错误

# Task Dependencies

- Task 2 依赖 Task 1（需要新枚举值才能让部分字段合法）
- Task 3 依赖 Task 1（新词汇必须使用合法枚举值）
- Task 4 依赖 Task 1（映射表引用枚举值）
- Task 5 依赖 Task 1、Task 2、Task 3（校验所有词汇）
- Task 6 依赖 Task 1（HOOK 枚举值）
- Task 7 依赖 Task 1-6 全部完成
- Task 1、Task 6 可并行启动（均修改类型/定义文件，但无相互依赖）
