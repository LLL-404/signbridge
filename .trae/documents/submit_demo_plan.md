# 紧急提交计划：SignBridge 手语桥 → Trae AI 创造力大赛

**状态：** 🔴 紧急（今天 2026-07-15 是初赛截止日）
**预计耗时：** 15-20分钟

---

## 关键信息（已确认）

| 项 | 值 |
|----|----|
| 项目名称 | SignBridge 手语桥 — AI 手语翻译官 |
| 赛道 | 社会服务赛道 |
| GitHub 仓库 | https://github.com/LLL-404/signbridge |
| 在线 Demo | https://lll-404.github.io/signbridge/ |
| 论坛状态 | 用户已登录 forum.trae.cn |
| 材料状态 | README/演示脚本/PPT大纲/22个spec文档全部就绪 |

---

## 执行步骤

### 步骤 1：验证 Demo 可访问（2分钟）
- 使用 agent-browser 打开 https://lll-404.github.io/signbridge/ 确认页面正常加载
- 截图确认3D虚拟人渲染正常

### 步骤 2：访问 Trae 论坛初赛专区（3分钟）
- 导航到 https://forum.trae.cn/c/38-category/40-category/40 （初赛专区）
- 快照页面，确认发帖按钮位置
- 检查是否已有报名帖：
  - 如果已有：记录报名帖链接
  - 如果没有：先快速发布报名帖（精简版）

### 步骤 3：准备 Demo 帖正文（预生成，5分钟）
基于现有文档组装完整帖子内容（已预先生成，执行时直接复制粘贴）：

**标题：** `【社会服务】SignBridge 手语桥 — AI 手语翻译官`

**正文包含四部分：**
1. **项目简介**（来自 README.md）
   - 2700万听障人士痛点
   - 四大核心功能：语音转手语/手语转文字/双向对话/学习模式
   - 技术亮点：VRM 3D虚拟人/FABRIK IK/纯前端/首屏gzip 55KB

2. **实现思路**（来自 PRESENTATION_OUTLINE.md）
   - 三层技术架构
   - 四大技术创新：文法引擎/3D驱动/识别引擎/DTW评分

3. **体验地址**
   - 在线Demo：https://lll-404.github.io/signbridge/
   - GitHub：https://github.com/LLL-404/signbridge
   - 使用建议：Chrome浏览器 + 允许麦克风/摄像头

4. **TRAE 实践过程**
   - 22个spec文档清单（来自.trae/specs/）
   - Session IDs：
     - 6a536f1fac1262a30a0606f1（词汇扩展+动画修复）
     - （从记忆中再提取2个）
   - 报名帖链接（步骤2获取）
   - 开发截图3张（Trae IDE工作区/IK求解器代码/Demo运行画面）

### 步骤 4：发布 Demo 帖（5分钟）
- 在初赛专区点击"发新帖"
- 选择标签：社会服务
- 粘贴标题和正文
- 上传/插入截图（如支持）
- 预览确认 → 发布
- 记录最终帖子URL

### 步骤 5：收尾更新（2分钟）
- 更新 README.md 参赛信息：阶段改为"初赛提交完成"，补充帖子链接
- 更新 CHANGELOG.md [Unreleased] 添加 chore(competition) 条目

---

## 风险与应急方案

| 风险 | 应急 |
|------|------|
| GitHub Pages 404 | 立即启动本地 dev server (npm run dev) 作为备选；或用GitHub仓库链接代替 |
| 论坛需要重新登录 | 暂停等待用户手动扫码/输入 |
| 图片上传失败 | 正文不依赖图片，文字内容完整即可提交 |
| 帖子字符限制 | 优先保留核心内容，spec清单可精简为8-10个关键项 |

---

## 成功标准
- Demo帖出现在初赛专区列表
- 四部分内容完整（简介/思路/体验地址/TRAE实践）
- 包含≥3个Session ID
- 在线Demo链接可访问
- README/CHANGELOG已更新
