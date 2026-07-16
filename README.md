# 手语桥 SignBridge

> AI手语翻译官 — 让沟通跨越声音的边界

## 项目简介

手语桥（SignBridge）是一个AI驱动的双向手语翻译系统，旨在打破听障人士与健听人之间的沟通壁垒。

在中国，超过**2700万**听障人士以手语作为母语。现有翻译工具多为单向识别（手语→文字），且输出冷冰冰的文字。听障人士"看文字"和"看手语"的理解效率完全不同，后者才是他们的母语。

## 核心功能

| 功能 | 说明 |
|------|------|
| 🗣️→✋ 语音转手语 | 说话即见手语，3D虚拟人实时驱动 |
| ✋→📝 手语识别 | 拍摄手语视频，智能识别转文字 |
| 🔄 双向对话 | 健听人与听障人士实时无障碍沟通 |
| 📚 手语学习 | 词汇查询、跟练、AI纠错陪练 |

## 技术架构

```
架构：微内核 + 插件化（PluginManager + EventBus + KernelAPI）
前端：React 18 + TypeScript + Vite + Tailwind CSS
渲染：Three.js (3D虚拟人) + Canvas 2D (降级渲染)
识别：MediaPipe Hands (21关键点) + TensorFlow.js LSTM + 几何规则
存储：IndexedDB (词汇库/动作数据/模型缓存)
状态：Zustand + React Router

核心模块：
  - kernel/         微内核（插件管理 + 事件总线）
  - plugins/        内置插件注册中心
  - modules/avatar  虚拟人驱动（动作合成 + IK + 过渡引擎 + VRM 适配）
  - modules/recognition  手语识别（Worker + 规则 + LSTM + 连续识别 + 组合识别）
  - modules/grammar 语法引擎（FMM分词 + 重写 + 词汇映射）
  - modules/learning 跟练评分（DTW + 三维度评分）
  - modules/data    数据层（IndexedDB + 词汇/动作存储 + 数据采集）

AI能力：
  - Web Speech API (浏览器原生语音识别)
  - 自研手语文法引擎 (中文↔手语语序转换)
  - MediaPipe Hands (手部 21 关键点检测)
  - Three.js WebGL (3D 实时骨骼动画合成)
  - TF.js LSTM (序列分类，[30,126] → softmax)
  - DTW 动态时间规整 (跟练对齐评分)
```

## 项目结构

```
signbridge/
├── frontend/                 # 前端应用（纯前端，无后端依赖）
│   ├── src/
│   │   ├── kernel/           # 微内核（插件管理 + 事件总线）
│   │   ├── plugins/          # 内置插件注册中心
│   │   ├── modules/          # 核心业务模块
│   │   │   ├── avatar/       # 虚拟人驱动（动作合成 + IK + 过渡引擎 + VRM 适配）
│   │   │   ├── recognition/  # 手语识别（Worker + 规则 + LSTM + 连续识别 + 组合识别）
│   │   │   ├── grammar/      # 语法引擎（FMM分词 + 重写 + 词汇映射）
│   │   │   ├── learning/     # 跟练评分（DTW + 三维度评分）
│   │   │   └── data/         # 数据层（IndexedDB + 词汇/动作存储 + 数据采集）
│   │   ├── components/       # UI 组件（layout/avatar/sign/voice/learning/common/debug）
│   │   ├── pages/            # 页面
│   │   ├── hooks/            # React Hooks
│   │   ├── stores/           # Zustand 状态
│   │   ├── types/            # TypeScript 类型
│   │   ├── data/             # 演示场景数据
│   │   ├── styles/           # 全局样式
│   │   ├── App.tsx           # 应用根组件
│   │   ├── config.ts         # 环境配置
│   │   ├── main.tsx          # 应用入口
│   │   └── routes.tsx        # 路由配置（动态从插件管理器读取）
│   ├── public/               # 静态资源（手势库/词汇库/VRM 模型）
│   ├── scripts/              # 开发工具脚本
│   ├── e2e/                  # E2E 测试
│   └── package.json
├── docs/                     # 项目文档
│   ├── CODE_WIKI.md          # 代码知识库
│   ├── DEMO_SCRIPT.md        # 演示脚本
│   ├── DEPLOY_GUIDE.md       # 部署指南
│   ├── PRESENTATION_OUTLINE.md # 演讲大纲
│   └── superpowers/          # 设计与规划文档
├── .github/workflows/        # CI/CD 配置
├── README.md                 # 项目说明
├── index.html                # 创意提案展示页
├── start.bat                 # Windows 启动脚本
├── start.ps1                 # PowerShell 启动脚本
└── byteplus-pages.yaml       # BytePlus Pages 部署配置
```

## 差异化竞争力

**vs 现有手语识别工具：**
- 现有：单向识别，输出文字，工具感强
- 我们：**双向翻译**，**3D虚拟人输出**，有温度

**vs 通用AI翻译：**
- 通用：文字↔文字，不考虑手语语法
- 我们：专门的手语文法引擎，符合手语表达习惯

## 目标用户

- **听障人士**：医院看病、办事窗口、日常社交，缺乏即时翻译工具
- **健听人家属/朋友**：想学习手语与亲人沟通，缺乏系统学习资源
- **公共服务机构**：银行、医院、政务大厅，需要低成本无障碍服务方案
- **手语学习者**：需要实时反馈和陪练工具

## 价值与意义

**社会价值：**
- 打破听障人士与社会的沟通壁垒，提升社会包容性
- 降低公共服务机构的无障碍服务成本
- 推动手语教育数字化，让更多人学习手语

**技术价值：**
- 填补"文字→手语虚拟人驱动"的技术空白
- 手语文法引擎：解决中文语序与手语语序的转换难题
- 3D实时骨骼动画合成，非预录视频播放

**商业价值：**
- 公共服务机构付费部署（医院、银行、政务大厅）
- 手语教育SaaS订阅
- 企业无障碍合规解决方案

## 项目文件

- `frontend/` — 完整前端应用（React + TypeScript + Vite）
- `docs/CODE_WIKI.md` — 代码知识库
- `docs/COMPETITION_REGISTRATION_GUIDE.md` — 大赛报名指南
- `docs/DEMO_SCRIPT.md` — 演示脚本
- `docs/DEPLOY_GUIDE.md` — 部署指南
- `docs/PRESENTATION_OUTLINE.md` — 演讲大纲
- `CHANGELOG.md` — 变更日志（记录所有版本变更）
- `index.html` — 创意提案展示页面
- `README.md` — 项目说明文档

## 参赛信息

- **大赛：** TRAE AI 创造力大赛
- **赛道：** 社会服务赛道
- **阶段：** 初赛 Demo 已提交（2026.7.15）
- **报名帖：** https://forum.trae.cn/t/topic/25741
- **Demo 帖：** https://forum.trae.cn/t/topic/167826
- **Demo 体验：** https://LLL-404.github.io/signbridge/
- **GitHub 仓库：** https://github.com/LLL-404/signbridge

---

> 烛光虽微，却能照亮黑暗；言辞虽简，却能传递心意
