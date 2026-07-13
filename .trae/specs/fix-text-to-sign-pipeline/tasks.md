# Tasks

- [x] Task 1: 修复 DataInitializer.ts 缺失 log 变量
  - [x] SubTask 1.1: 在 DataInitializer.ts 中导入 logger 模块并创建 log 实例
  - [x] SubTask 1.2: 验证错误路径（fetch 失败、数据为空）不再崩溃

- [x] Task 2: 修复 vocabularyUrl 不兼容 Vite base 路径
  - [x] SubTask 2.1: 在 config.ts 中将 vocabularyUrl 改为基于 import.meta.env.BASE_URL 的相对路径
  - [x] SubTask 2.2: 验证开发模式（base=/）和 GitHub Pages 模式（base=/signbridge/）下 URL 均正确

- [x] Task 3: 补全 horizontal_line / vertical_line 运动类型处理
  - [x] SubTask 3.1: 在 AvatarDriver.generateBasicMotion 的 applyMovementOffset 中添加 horizontal_line（左右偏移）和 vertical_line（上下偏移）处理
  - [x] SubTask 3.2: 在 AvatarDriver.generateMotion（VRM 轨道）中为 horizontal_line 和 vertical_line 添加专用关键帧（5帧摆动）

- [x] Task 4: GlossMapper 返回未匹配词列表
  - [x] SubTask 4.1: 修改 GlossMapper.map 返回值，包含 matched items 和 unmatched words
  - [x] SubTask 4.2: 修改 GrammarEngine.convert 透传未匹配词到 GlossSequence
  - [x] SubTask 4.3: 修改 GlossSequence 类型定义添加 unmatched_words 字段

- [x] Task 5: UI 层显示未匹配词汇反馈
  - [x] SubTask 5.1: 在 VoiceToSignPage 中展示 unmatched_words 提示
  - [x] SubTask 5.2: 在 DialoguePage 中展示 unmatched_words 提示
  - [x] SubTask 5.3: 当 GlossSequence.items 为空时显示"未识别到任何手语词汇"提示

# Task Dependencies
- Task 4 依赖 Task 1（确保词汇数据能正确加载后再测试映射）
- Task 5 依赖 Task 4（UI 展示依赖 GlossMapper 返回的未匹配词列表）
- Task 3 独立，可与 Task 1/2 并行
