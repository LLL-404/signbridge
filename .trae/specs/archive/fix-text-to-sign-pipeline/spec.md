# 文字转手语管道修复 Spec

## Why
用户输入文字后系统无法识别并生成对应手语动作。经排查发现管道中存在多个 bug：DataInitializer 缺少 log 变量导致错误路径崩溃、horizontal_line 等运动类型未在动作生成器中处理导致无可见动画、词汇匹配失败时无任何用户反馈。

## What Changes
- 修复 `DataInitializer.ts` 中缺失的 `log` 变量（导入 logger 模块）
- 修复 `vocabularyUrl` 配置：使用相对路径 `import.meta.env.BASE_URL + 'data/vocabulary.json'` 替代绝对路径，兼容 GitHub Pages 子路径部署
- 在 `AvatarDriver.generateBasicMotion` 的 `applyMovementOffset` 中补全 `horizontal_line` 和 `vertical_line` 运动类型处理
- 在 `AvatarDriver.generateMotion`（VRM 轨道）中为 `horizontal_line` 和 `vertical_line` 添加专用关键帧生成逻辑
- 在 `VoiceToSignPage` 和 `DialoguePage` 中：当 GlossSequence 为空或部分词未匹配时，显示用户可见的反馈信息
- 在 `GlossMapper` 中返回未匹配词列表，供 UI 层展示

## Impact
- Affected code: `DataInitializer.ts`, `config.ts`, `AvatarDriver.ts`, `GlossMapper.ts`, `VoiceToSignPage.tsx`, `DialoguePage.tsx`
- Affected specs: 文字转手语核心管道

## ADDED Requirements

### Requirement: 未匹配词汇反馈
当用户输入的文字无法匹配到任何手语词汇时，系统 SHALL 显示明确的提示信息，告知用户哪些词未被识别。

#### Scenario: 全部未匹配
- **WHEN** 用户输入"今天天气很好"且词汇库中无任何匹配
- **THEN** 显示"以下词汇未识别：今天、天气、很、好"的提示

#### Scenario: 部分匹配
- **WHEN** 用户输入"你好朋友"且"你好"匹配但"朋友"未匹配
- **THEN** 播放"你好"的手语动作，同时显示"朋友 未识别"的提示

### Requirement: horizontal_line 运动类型支持
系统 SHALL 正确处理 `horizontal_line` 和 `vertical_line` 运动类型，生成可见的水平/垂直摆动动作。

#### Scenario: 再见手势
- **WHEN** 播放 gloss_003（再见），movement 为 horizontal_line，location_start/end 均为 face_level
- **THEN** 虚拟人手部在面部高度做左右摆动动作

## MODIFIED Requirements

### Requirement: 词汇数据初始化
DataInitializer 在任何错误路径下 SHALL 不崩溃，并使用 logger 模块输出警告信息。词汇数据 URL SHALL 兼容 Vite base 路径配置。

#### Scenario: fetch 失败
- **WHEN** vocabulary.json 请求返回 404
- **THEN** 输出警告日志"加载词汇数据失败：HTTP 404"，使用内置常用词汇继续运行，不抛出未捕获异常

#### Scenario: GitHub Pages 部署
- **WHEN** 应用部署在 `/signbridge/` 子路径下
- **THEN** 词汇数据请求 URL 为 `/signbridge/data/vocabulary.json`
