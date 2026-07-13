# 手语动作管道端到端修复 Spec

## Why
用户反馈"模型根本不能，也无法完成手语动作"。经深度代码审查发现：管道各模块（词汇数据、语法引擎、动作生成、IK 解算、VRM 渲染）代码逻辑独立看是完整的，但端到端存在多个断裂点导致整个管道无法工作。核心问题包括：无文本输入入口、数据加载竞态、管道无诊断日志、VRM 轨道与 BonePose 轨道时序不同步。

## What Changes
- 在 VoiceToSignPage 添加文本输入框，支持打字输入触发手语播放
- 在 GrammarEngine.convert 全管道添加诊断日志（分词结果、映射结果、动作生成结果）
- 修复 VocabularyStore 数据加载竞态：GrammarEngine.convert 等待词汇数据初始化完成后再执行
- 修复 AvatarDriver 双轨道时序问题：VRM 轨道与 BonePose 轨道统一完成时机，避免 VRM 提前结束
- 在 VoiceToSignPage 添加管道状态可视化（加载中/转换中/播放中/错误）
- 添加端到端冒烟测试验证：输入"你好"→模型有可见动作

## Impact
- Affected code: `VoiceToSignPage.tsx`, `GrammarEngine.ts`, `AvatarDriver.ts`, `VocabularyStore.ts`, `DataInitializer.ts`
- Affected specs: 文字转手语核心管道, fix-text-to-sign-pipeline

## ADDED Requirements

### Requirement: 文本输入入口
VoiceToSignPage SHALL 提供文本输入框，用户可以打字输入中文文字触发手语播放，不依赖语音输入。

#### Scenario: 打字输入触发手语
- **WHEN** 用户在文本输入框输入"你好"并按下回车或点击播放按钮
- **THEN** 系统通过 GrammarEngine 转换为 GlossSequence，AvatarDriver 驱动 VRM 模型播放手语动作

#### Scenario: 空输入不触发
- **WHEN** 用户在空文本框按下回车
- **THEN** 不触发任何转换和播放

### Requirement: 管道诊断日志
GrammarEngine.convert SHALL 在每个管道阶段输出诊断日志，包括分词数量、映射成功率、生成动作数量。

#### Scenario: 管道正常执行
- **WHEN** 用户输入"你好谢谢"
- **THEN** 日志输出："[GrammarEngine] 分词结果: ['你好','谢谢']"、"[GrammarEngine] 映射结果: 2/2 匹配"、"[GrammarEngine] 生成动作: 2 个"

#### Scenario: 管道部分失败
- **WHEN** 用户输入"你好xyz"
- **THEN** 日志输出："[GrammarEngine] 映射结果: 1/2 匹配, 未匹配: ['xyz']"

### Requirement: 管道状态可视化
VoiceToSignPage SHALL 显示当前管道状态（就绪/转换中/播放中/错误），让用户明确知道系统在做什么。

#### Scenario: 转换中状态
- **WHEN** 用户提交文本后 GrammarEngine 正在处理
- **THEN** UI 显示"转换中..."状态指示

#### Scenario: 播放中状态
- **WHEN** AvatarDriver 正在驱动模型播放手语
- **THEN** UI 显示"播放中..."状态指示，且播放按钮禁用

### Requirement: 数据加载保证
GrammarEngine.convert SHALL 确保 VocabularyStore 已完成初始化后再执行分词和映射，避免因数据未加载导致全部词汇不匹配。

#### Scenario: 首次输入在数据加载完成前
- **WHEN** 用户在页面刚加载、vocabulary.json 尚未下载完成时输入文本
- **THEN** GrammarEngine 等待 initializeVocabulary() 完成后再执行转换，UI 显示"加载数据中..."

## MODIFIED Requirements

### Requirement: AvatarDriver 双轨道同步
AvatarDriver SHALL 统一 VRM 轨道与 BonePose 轨道的完成时机。当任一轨道仍在播放时，playing 状态保持为 true，getCurrentVRMPose 返回当前插值姿态而非 NEUTRAL_VRM_POSE。

#### Scenario: VRM 轨道先完成
- **WHEN** VRM 队列播放完毕但 BonePose 队列仍有过渡动画
- **THEN** vrmPlaying 保持 true，getCurrentVRMPose 返回最后一帧姿态（不跳回中性），直到 BonePose 队列也完成

#### Scenario: BonePose 轨道先完成
- **WHEN** BonePose 队列播放完毕但 VRM 队列仍有动作
- **THEN** playing 保持 true，VRM 轨道继续推进直到完成，然后 finish()
