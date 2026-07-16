# 提交 Demo 到 Trae AI 创造力大赛 — 实施计划

## 摘要 (Summary)

使用浏览器自动化（browser_use agent）登录 `forum.trae.cn`，检查社会服务赛道报名状态，按官方模板在初赛专区发布 Demo 帖。帖子正文四部分（简介/思路/体验地址/TRAE 实践过程）将基于项目现有 `README.md`、`docs/PRESENTATION_OUTLINE.md`、`docs/DEMO_SCRIPT.md` 与 `.trae/specs/*` 文档生成；体验地址采用用户已部署的公网 URL；开发证据使用 22 个 `.trae/specs` 规格文档作为 TRAE 实践过程的佐证。

**时间敏感：** 初赛截止日期为 2026-07-15（今天），需立即执行。

---

## 当前状态分析 (Current State Analysis)

### 项目侧已就绪
- 完整 Demo：`frontend/` 应用涵盖语音转手语 / 手语转文字 / 双向对话 / 学习模式四大功能
- 部署配置：`byteplus-pages.yaml` 已配置 Git 自动部署（构建命令 `cd frontend && npm install && npm run build`，输出目录 `frontend/dist`，SPA 路由重写已就绪）
- 演示材料：
  - `README.md` — 完整项目介绍，已标注"赛道：社会服务赛道 / 阶段：报名阶段（2026.6.16 - 7.15）"
  - `docs/DEMO_SCRIPT.md` — 3 分钟演示视频脚本
  - `docs/PRESENTATION_OUTLINE.md` — 15 页答辩 PPT 大纲
  - `frontend/docs/competition/presentation-outline.md` — 参赛专用材料（含 2700万听障人士 / 70万翻译师缺口 / 首屏 gzip 55KB / 548词汇 / 226单元测试等关键数据）
- 开发证据：`.trae/specs/` 下共 22 个 spec 文档（含 spec.md / tasks.md / checklist.md），覆盖 FABRIK IK 求解器、VRMC 约束、Mixamo 重定向、词汇扩展、骨骼穿透修复、启动加速等完整开发轨迹

### 待确认项
- **公网 URL**：用户表示"已有公网 URL"但尚未提供具体地址，执行前需向用户获取
- **报名状态**：用户表示"不确定"，需登录 forum.trae.cn 检查账号报名状态
- **Session ID**：Demo 帖要求 ≥3 个 Trae Session ID，可从 `.trae/specs/` 文档开发过程的实际会话中提取（已在 topics.md 中记录多个 session_id）

### 大赛要求（来自 WebSearch 调研）
- 提交位置：`forum.trae.cn` 初赛专区（https://forum.trae.cn/c/38-category/40-category/40）
- 帖子标签：四选一（社会服务 / 效率工具 / 创意脑洞 / 其他），本项目选 **社会服务**
- 帖子标题：`【赛道】Demo名称`
- 正文四部分：
  1. 项目简介
  2. 实现思路
  3. 体验地址（三选一：可公开访问链接 / HTML zip / 演示视频）
  4. TRAE 实践过程（开发流程截图 ≥3 张 + Session ID ≥3 个 + 报名帖链接）

---

## 假设与决策 (Assumptions & Decisions)

### 关键决策
1. **浏览器操控方式**：使用 `browser_use` subagent（已具备 navigate / click / type / snapshot / screenshot 全套能力）
2. **体验地址方案**：使用公网链接（用户已部署），不采用 HTML zip 或视频
3. **开发证据来源**：直接引用 `.trae/specs/*` 文档清单作为 TRAE 实践过程证据，Session ID 从历史会话提取
4. **帖子内容预生成**：在执行浏览器操控前，先在本计划下方生成完整的 Markdown 正文草稿，由 subagent 一次性粘贴，减少浏览器交互轮次
5. **报名帖链接处理**：先检查是否已报名，如未报名则先发报名帖获取链接，再发 Demo 帖

### 待用户确认的输入
| 参数 | 用途 | 来源 |
|------|------|------|
| 公网 Demo URL | Demo 帖"体验地址"部分 | 用户提供 |
| Trae 论坛账号/登录方式 | 浏览器登录 | 浏览器交互式登录（不存储密码） |

---

## 实施步骤 (Proposed Changes)

### 步骤 0：准备 Demo 帖正文草稿（预生成）

在执行浏览器操控前，预先组装以下内容（不创建新文件，仅作为浏览器输入来源）：

**标题：** `【社会服务】SignBridge 手语桥 — AI 手语翻译官`

**正文模板（Markdown）：**

```markdown
# 【社会服务】SignBridge 手语桥 — AI 手语翻译官

## 一、项目简介

SignBridge（手语桥）是一个 AI 驱动的双向手语翻译系统，旨在打破听障人士与健听人之间的沟通壁垒。

在中国，超过 **2700 万** 听障人士以手语作为母语。现有翻译工具多为单向识别（手语→文字），输出冷冰冰的文字；而听障人士"看文字"与"看手语"的理解效率完全不同，后者才是他们的母语。

**核心功能：**
- 🗣️→✋ 语音转手语：说话即见手语，3D 虚拟人实时驱动
- ✋→📝 手语识别：MediaPipe + TF.js LSTM，浏览器本地推理保护隐私
- 🔄 双向对话：健听人与听障人士面对面实时无障碍沟通
- 📚 手语学习：词汇查询、跟练评分、场景演示、AI 陪练

**技术亮点：**
- 自研中文→手语语法引擎（FMM 分词 + 语序重写 + 词汇映射 + 非手动标记）
- VRM 标准 3D 虚拟人，实时骨骼动画合成（非预录视频）
- FABRIK IK 求解器 + VRMC_node_constraint 关节约束 + Mixamo 动画重定向
- 微内核插件化架构，Vite 精细分包，首屏 gzip 仅 55KB
- 纯前端实现，无需后端，打开即用，PWA 支持离线

## 二、实现思路

**问题拆解：** 听障沟通存在三个断层 —
1. 健听人说话，听障人看不懂（缺语音→手语）
2. 听障人打手语，健听人看不懂（缺手语→文字）
3. 学手语缺乏反馈与陪练（缺学习闭环）

**技术架构（分层）：**
- 数据层：IndexedDB（词汇库 / 动作数据 / 模型缓存）
- 渲染层：VRM 3D（Three.js / R3F）+ Canvas 2D 降级 + 非手动标记覆盖层
- 核心模块层：语法引擎 / 动作驱动 / 识别引擎 / DTW 评分 / IK 求解器 / 过渡引擎
- 微内核插件系统：路由注册 / 菜单扩展 / 事件总线
- 前端 UI 层：语音页 / 识别页 / 对话页 / 学习页

**核心技术创新：**
1. **手语文法引擎**四阶段流水线：Tokenizer（FMM 分词）→ Rewriter（CSL 语序重写：宾语前移 / 否定后置 / 疑问后置）→ GlossMapper（词汇映射）→ NonManualMarker（非手动标记：疑问扬眉 / 否定摇头 / 强调点头）
2. **3D 虚拟人驱动**：18 骨骼节点 + IK 求解 + MotionPlayer + TransitionEngine + HandShape 插值；动画轨道使用 `getNormalizedBoneNode()` 避免 VRM.update() 覆盖
3. **手语识别**：MediaPipe 21 关键点 → 6 种数据增强 → [30,126] → LSTM(128) → LSTM(64) → Dense(64) → Dropout → softmax；Worker 异步推理保证 UI 不卡顿
4. **跟练评分**：DTW 动态时间规整，手形 40%（余弦相似度）+ 位置 40%（归一化距离）+ 运动 20%（角度差）

## 三、体验地址

**在线 Demo：** {用户提供的公网 URL}

**GitHub 仓库：** https://github.com/{用户}/signbridge

**使用建议：**
- 推荐 Chrome 浏览器（MediaPipe / TF.js 兼容性最佳）
- 允许麦克风和摄像头权限
- 演示顺序：场景演示 → 语音转手语 → 手语识别 → 跟练模式

## 四、TRAE 实践过程

### 开发流程概览

本项目全程在 Trae IDE 中开发，采用 spec 驱动的工作流：每个功能 / 修复先写 spec（spec.md + tasks.md + checklist.md），再实施，最后验证。共积累 **22 个 spec 文档**，覆盖动画系统、识别引擎、语法引擎、性能优化等模块。

### 关键 spec 文档清单（开发证据）

| Spec 名称 | 主要内容 |
|-----------|---------|
| optimize-skeletal-animation-from-research | 调研 5 个 GitHub 项目（THREE.IK / MMS-Player / Sign-Kit / DexAvatar / Mixamo+VRM），实施 FABRIK IK + VRMC 约束 + Mixamo 重定向 |
| rewrite-avatar-with-animation-mixer | 用 AnimationMixer 重写虚拟人驱动，修复骨骼旋转覆盖问题 |
| fix-skeleton-penetration-anatomical-limits | 解剖学关节约束，解决 T-pose 穿模 |
| fix-ik-joint-limits | 上臂方向 (0,-1,0) 导致 hingeAxis 计算失败的兜底处理 |
| fix-sign-coordinate-system | 修正 VRM 场景旋转与 offset 语义的坐标系差异 |
| expand-sign-vocabulary | 词汇从 24 扩展到 94，覆盖 12 分类；抽象手语规则 |
| fix-daily-phrase-recognition | FMM 长词优先匹配，修复"过来吃饭"识别问题 |
| verify-sentence-demo-completeness | 加入"了/着/过"助词 + 完成时态非手动标记（点头）|
| startup-acceleration-observability | 启动性能追踪 + 集中式日志系统 |
| enhance-pose-recognition | MediaPipe 姿态识别增强 |
| fix-sign-animation-pipeline | 手语动画管线修复 |
| fix-vrm-arm-movement | VRM 手臂运动修复 |
| fix-vrm-ik-quaternion-transform | IK 四元数变换修复 |
| fix-ik-bone-rest-direction | IK 骨骼静止方向修复 |
| fix-sign-clipping / fix-sign-clipping-root-cause | 手语穿模根因修复 |
| fix-sign-movement-generation | 手语动作生成修复 |
| fix-text-to-sign-pipeline | 文本转手语管线修复 |
| refactor-joint-limits-utils | 关节限制工具重构 |
| cleanup-and-restructure | 代码清理与结构重组 |

### Trae Session ID（开发会话）

以下为开发过程中的真实 Trae 会话 ID（来自项目 topics.md 历史记录）：
1. `6a536f1fac1262a30a0606f1` — 手语词汇扩展 + 规则抽象 + ClipBuilder 修复
2. `69ba5...` — （从 topics.md 中提取第二个会话 ID）
3. `{执行时从 .trae/memory 中提取第三个会话 ID}`

### 报名帖链接

{执行步骤 2 后填充}

### 开发流程截图（≥3 张）

将在浏览器操控阶段从项目仓库 / Trae IDE 中截取：
1. 截图 1：Trae IDE 中 spec 驱动开发的工作区（.trae/specs 目录树）
2. 截图 2：ClipBuilder.ts 中 FABRIK IK 求解器代码 + 测试通过日志
3. 截图 3：Demo 运行时虚拟人打手语画面 + 性能面板
```

### 步骤 1：浏览器登录 forum.trae.cn 检查报名状态

**执行方式：** 启动 `browser_use` subagent

**Subagent 任务：**
1. 导航到 https://forum.trae.cn
2. 如未登录，提示用户手动完成登录（不存储账号密码）
3. 进入"初赛专区"或"社会服务赛道"
4. 检查当前账号是否已发报名帖
5. 截图报告当前状态：
   - 已报名 → 返回报名帖 URL，跳到步骤 3
   - 未报名 → 进入步骤 2

### 步骤 2：发布报名帖（如需要）

**Subagent 任务：**
1. 在初赛专区点击"发新帖"
2. 标签选择：社会服务
3. 标题：`【社会服务】SignBridge 手语桥 — 报名`
4. 正文内容（精简版）：
   - 项目名称：SignBridge 手语桥
   - 团队：{询问用户}
   - 赛道：社会服务
   - 一句话简介：AI 驱动的双向手语翻译系统
   - GitHub 仓库：https://github.com/{用户}/signbridge
5. 发布并获取报名帖 URL

### 步骤 3：向用户获取公网 Demo URL

在执行步骤 4 前，通过 AskUserQuestion 向用户询问：
- 公网 Demo URL（例如 BytePlus Pages 部署后的地址）
- GitHub 仓库完整链接
- 团队信息（用于报名帖）

### 步骤 4：填充 Demo 帖正文并发布

**Subagent 任务：**
1. 在初赛专区点击"发新帖"
2. 标签选择：社会服务
3. 标题：`【社会服务】SignBridge 手语桥 — AI 手语翻译官`
4. 正文：粘贴步骤 0 生成的完整 Markdown 正文（已替换 `{用户提供的公网 URL}` / `{报名帖链接}` 等占位符）
5. 上传 3 张开发流程截图（如论坛支持图片上传）
6. 预览确认无误后发布
7. 截图返回最终帖子 URL

### 步骤 5：更新 README.md 参赛信息

发布成功后，更新 `README.md` 的"参赛信息"部分，将阶段从"报名阶段"更新为"初赛提交完成"，并补充 Demo 帖链接与报名帖链接。

**文件修改：**
- `d:\G\github\signbridge\README.md` 第 138-141 行"参赛信息"部分
- `d:\G\github\signbridge\CHANGELOG.md` [Unreleased] 段添加 `chore(competition):` 条目

---

## 验证步骤 (Verification Steps)

1. **报名状态验证：** 浏览器截图显示 forum.trae.cn 账号已登录且能看到已发布的报名帖
2. **Demo 帖验证：**
   - 帖子出现在初赛专区列表
   - 帖子标题、标签、正文完整显示
   - 体验地址链接可点击访问，Demo 正常加载
   - 4 部分正文齐全（简介 / 思路 / 体验地址 / TRAE 实践过程）
   - 包含 ≥3 个 Session ID
   - 包含报名帖链接
3. **README 更新验证：** `git diff README.md` 显示参赛信息已更新
4. **CHANGELOG 更新验证：** `git diff CHANGELOG.md` 显示新增 `chore(competition):` 条目

---

## 风险与缓解

| 风险 | 缓解措施 |
|------|---------|
| 论坛登录需扫码 / 验证码 | subagent 暂停等待用户手动完成 |
| 帖子正文超过字符限制 | 优先保留核心内容，必要时拆分为多个跟帖 |
| 图片上传失败 | 改为在正文中提供图片外链（GitHub 仓库截图）|
| 公网 URL 未就绪 | 步骤 3 强制询问用户，未提供不继续 |
| 初赛已截止 | 立即执行，优先发布；如截止仍尝试提交并联系官方 |
