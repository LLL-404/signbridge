# Checklist

- [x] CommonVocabulary.ts 新增 7 个词条（过来、吃饭、饭、喝、菜、饱、渴），gloss_id 唯一且递增
- [x] 每个新词的 movement ∈ Movement 枚举 19 种之一
- [x] 每个新词的 palm_orientation ∈ PalmOrientation 枚举 6 种之一
- [x] 每个新词的 handshape ∈ HandShape 枚举、location ∈ HandLocation 枚举
- [x] 每个新词的 expression ∈ FacialExpression 枚举、head_movement ∈ HeadMovement 枚举
- [x] Tokenizer.VERBS 已补全「过」「喝」
- [x] Tokenizer 新增 NOUNS 词表，PosTagger.tagWord 能对名词返回 'n'
- [x] tsc --noEmit 通过，0 error
- [x] eslint 通过，0 error/warning
- [x] 启动 dev server 后 validateVocabulary 校验通过，无枚举非法错误日志
- [x] 输入「过来吃饭」分词为 ["过来","吃饭"]，GlossMapper 全部匹配，unmatchedWords 为空
- [x] 输入「过来吃饭」虚拟人顺序播放「过来」「吃饭」两个手语动作，动作可见
- [x] 输入「喝水」分词为 ["喝","水"]，全部匹配并播放
- [x] 输入「去吃饭」分词为 ["去","吃饭"]，全部匹配并播放
- [x] 输入词汇库不覆盖的词时 unmatchedWords 提示正常显示（不回归）
- [x] CHANGELOG.md [Unreleased] 已记录本次扩充
