# Checklist

## 枚举扩展
- [x] `HandShape` 枚举新增 `HOOK = 'hook'`
- [x] `Movement` 枚举新增 `WAVE`、`TAP`、`TAP_TWICE`、`FORWARD`、`HOOK_TOGETHER`、`WAVE_TWIST`、`SIDE_TO_SIDE`
- [x] `HeadMovement` 枚举新增 `TILT`、`SLIGHT_BOW`
- [x] `tsc --noEmit` 通过，无类型错误

## 词汇规范化
- [x] 现有词汇的 `handshape_start`/`handshape_end` 全部使用合法 `HandShape` 枚举值
- [x] 现有词汇的 `movement` 全部使用合法 `Movement` 枚举值（`'none'` 已替换为 `'static'`）
- [x] 现有词汇的 `location_start`/`location_end` 全部使用合法 `HandLocation` 枚举值
- [x] 现有词汇的 `expression` 全部使用合法 `FacialExpression` 枚举值
- [x] 现有词汇的 `head_movement` 全部使用合法 `HeadMovement` 枚举值

## 词汇扩充
- [x] `COMMON_VOCABULARY` 数组长度 ≥ 90（实际 94 个：24 原有 + 70 新增）
- [x] 覆盖 12 个类别：日常问候、代词、形容词、动词、疑问词、否定词、名词、情感、时间、数字、颜色、专有名词
- [x] 新增词汇的 `gloss_id` 无重复（gloss_500~gloss_569）
- [x] 新增词汇的 `duration_ms` 在合理范围（500-3000ms）
- [x] 新增词汇的 `difficulty` 为 1/2/3 之一
- [x] 数字 1-10 词汇使用对应 `HandShape`（1=`INDEX_POINT`、2=`V_SHAPE`、3=`THREE`、4=`FOUR`、5=`OPEN_5`、6=`SIX`、7=`SEVEN`、8=`EIGHT`、9=`NINE`、10=`TEN`）

## 规律规则抽象
- [x] `SignLanguageRules.ts` 导出 `HANDSHAPE_SEMANTIC_MAP`，覆盖全部 17 个手形
- [x] `SignLanguageRules.ts` 导出 `LOCATION_SEMANTIC_MAP`，覆盖全部 13 个位置
- [x] `SignLanguageRules.ts` 导出 `MOVEMENT_SEMANTIC_MAP`，覆盖全部 20 个运动
- [x] `SignLanguageRules.ts` 导出 `EXPRESSION_SEMANTIC_MAP`，覆盖全部 9 个表情
- [x] `SignLanguageRules.ts` 导出 `VOCABULARY_TEMPLATES`，包含 6 类模板（代词、问候、疑问、否定、情感、数字）
- [x] `applyVocabularyTemplate(name, overrides)` 函数能正确合并模板默认值与传入覆盖值
- [x] 每个映射表和模板均有中文注释说明规律来源

## 词汇校验
- [x] `validateSignGloss(gloss)` 能正确识别非法 `handshape`、`movement`、`location`、`expression`、`head_movement` 字段
- [x] `validateAllVocabulary()` 返回所有非法字段的详细报告（含 `gloss_id`、`field`、`value`）
- [x] 开发环境启动时自动调用 `runVocabularyValidationOnStartup()`（集成在 main.tsx createRoot 之前）
- [x] 全部词汇合法时，不输出任何 warning（静态分析确认所有字段使用合法枚举值）
- [x] 非法字段时，通过 `logger.warn` 输出 `[validateVocabulary]` 前缀的详细报告

## HandShape 定义补充
- [x] `HandShape.ts` 的 `HAND_SHAPE_DEFINITIONS` 新增 `HOOK` 手形定义
- [x] `HOOK` 手形定义合理（食指中节弯曲形成钩状，其余手指屈曲）

## CHANGELOG
- [x] `[Unreleased]` 的 `新增` 分类记录词汇扩充、规律规则、校验工具、枚举扩展
- [x] `[Unreleased]` 的 `修复` 分类记录词汇字段规范化、NonManualMarkerOverlay 回归修复、预存 tsc 错误清理

## 整体验证
- [x] `tsc --noEmit` 通过（退出码 0，无类型错误）
- [x] `eslint` 通过（退出码 0，无 lint 错误）
- [x] 开发环境启动后，控制台无 `[validateVocabulary]` warning（静态分析确认所有词汇字段合法）
- [x] 现有词汇的动画行为保持不变（字段值语义不变，仅字符串规范化）
