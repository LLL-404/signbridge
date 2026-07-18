# 变更日志

所有重要的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [Unreleased]

### 🔧 修复
- fix(lint): 修复 3 个 ESLint error——ClipBuilder.ts:445 `let elbowHint` 改为 `const`（prefer-const）；usePerformanceMonitor.ts:53 TTFB 计算移入 useState lazy initializer 消除 set-state-in-effect；AvatarCanvas.tsx:127 WebGL 检测移入 useState lazy initializer 消除 set-state-in-effect。`npx eslint .` 退出码 0（0 errors, 12 warnings）
- fix(avatar): 修复解析法 IK 上臂方向公式几何错误——`dir.applyAxisAngle(elbowDir, -shoulderLift)` 在垂直于 elbowDir 的平面内旋转，结果永远无 elbowDir 分量；正确公式为 `dir*cos(shoulderLift) + elbowDir*sin(shoulderLift)`（肘部在 elbowDir 方向偏移 L1*sin(shoulderLift)）。旧公式在 A-pose 下因对称性巧合正确，VRM T-pose 下对称性破坏导致 upperArmDir X 分量符号反转，右手臂伸到身体对侧（「他/谢谢/对不起」实测肘部穿透躯干）。ClipBuilder.ts 与 IKSolver.ts 同步修复，真实 VRM 模型集成测试 74 项全部通过
- fix(avatar): TAP/TAP_TWICE 运动轨迹从离散跳跃改为正弦波平滑过渡，消除 IK 解分支跳跃导致的动画抖动（wave/tap_twice 类词汇相邻帧旋转差异从 78° 降至 ≤60°）
- fix(avatar): ClipBuilder.buildArmTracks 新增 IK 解时序平滑后处理，检测相邻帧 lowerQuat 旋转差异 >60° 时用 SLERP 插值修正，解决 setFromUnitVectors 最短旋转在奇异点附近的分支跳跃问题

### ✨ 新增
- feat(avatar): 新增真实 VRM 模型集成测试（ClipBuilder.real-vrm-integration.test.ts），加载项目实际 avatar.vrm 文件（10.7MB），用 AnimationMixer.setTime() 在关键时间点采样骨骼世界位置，覆盖 8 个验证维度 × 12 个词汇 = 74 个测试：VRM 加载、手指骨骼、手臂轨道、手腕世界位置合理性、上臂/前臂旋转 ROM、肘部穿透检测、NaN 检测。从 mock VRM 升级到真实 VRM 后发现了 mock 测试无法发现的 IK 几何缺陷

### ✨ 新增
- feat(avatar): ClipBuilder 新增头部动作轨道生成（buildHeadMovementTrack），VRM 模式下 head_movement（nod/shake/tilt/slight_bow 等）不再丢失，neck 承担 60%、head 承担 40% 旋转使动作更自然
- feat(avatar): HandShape 手指骨骼支持 Y/Z 轴旋转（外展/内收），OPEN_5/V_SHAPE/HORNS/FOUR 等手形增加手指外展角度，左手 Y 轴自动镜像
- feat(avatar): FingerPose 类型扩展 mcpY/mcpZ/pipY/pipZ/dipY/dipZ 可选字段，向后兼容现有手形定义

### 🔧 修复
- fix(avatar): solveFABRIK 新增可选 restDir 参数，不再硬编码 BONE_REST_DIR=(0,-1,0)，ClipBuilder 传入 VRM 实际骨骼 rest direction 提高 IK 精度

### ✨ 新增
- feat(grammar): 时态助词"了/着/过"分词识别与非手语标记——Tokenizer PARTICLES 词表增加时态助词，NonManualMarker 新增完成体（了→slight_nod）/持续体（着）/经历体（过→shake）检测，优先级：疑问>否定>强调>时态>陈述；6 个演示句子（我今天吃饭了/你好朋友/谢谢老师/我想喝水/他明天来/我们是学生）端到端验证全部通过
- feat(data): 扩充餐饮/趋向类高频词条 7 个（过来/吃饭/饭/喝/菜/饱/渴），词汇库覆盖基本餐饮场景，修复「过来吃饭」等日常短语识别失败
- feat(avatar): 新增 BodyVolume 身体包络体模块（躯干胶囊/头部球/手臂胶囊），从 VRM normalized bone 实际位置推导包络参数，支持穿透检测与表面投影，不同模型自动适配
- feat(avatar): 新增 ClipBuilder 关键帧构建器
- feat(avatar): 新增 JointLimits 关节限制系统
- feat(avatar): 新增 KalidokitSolver 姿态求解器
- feat(avatar): 新增 RealtimePoseDriver 实时姿态驱动
- feat(avatar): 新增 VRMAnimator VRM 动画控制器
- feat(recognition): 新增 PoseEstimator 姿态估计器
- feat(recognition): 新增 STGCNRecognizer 时空图卷积识别器
- feat(recognition): 新增 pose.worker 姿态检测 Worker
- feat(hooks): 新增 usePoseTracking 姿态跟踪 Hook
- feat: 新增 docs/ 目录整理项目文档
- feat(data): 扩充内置词汇库至 94 个词汇，覆盖 12 个类别（日常问候、代词、形容词、动词、疑问词、否定词、名词、情感、时间、数字、颜色、专有名词）
- feat(data): 新增 SignLanguageRules.ts 手语动作规律规则，包含手形/位置/运动/表情 4 张语义映射表和 6 类参数组合模板
- feat(data): 新增 validateVocabulary.ts 词汇数据校验工具，开发环境启动时自动校验枚举合法性
- feat(types): HandShape 枚举新增 HOOK 手形，Movement 新增 7 个运动值，HeadMovement 新增 TILT/SLIGHT_BOW
- feat(avatar): 新增 FABRIK IK 求解器作为解析法的可选替代，支持多链协同与多目标约束
  - `IKSolver.ts` 新增 `solveFABRIK`、`solveFABRIKMultiChain` 函数
  - 失败时自动 fallback 到解析法 `solve`
  - 误差 ≤ 1e-3 米，迭代 ≤ 10 次
- feat(avatar): 集成 VRM 1.0 VRMC_node_constraint 规范，优先使用模型内置约束（roll/aim/rotation）
  - `JointLimits.ts` 新增 `applyVRMCConstraints`、`extractVRMCConstraints` 函数
  - VRMModel.tsx 加载阶段提取约束并存入 WeakMap 缓存
  - 无约束模型回退到现有 JointLimits 手动约束
- feat(avatar): 新增 Mixamo 动画重定向支持，可加载预录制 FBX 动画播放
  - 新增 `MixamoRetargeter.ts` 实现 MIXAMO_VRM_RIG_MAP 骨骼映射
  - `AvatarDriver` 新增 `playRetargetedAnimation(url)` 方法
  - 动态 import FBXLoader 避免首屏包体积增加
- feat(avatar): ClipBuilder 新增 IK_MODE 配置（'analytic' | 'fabrik' | 'constraint'），默认 'analytic' 保持现有行为不变

### 🔧 修复
- fix(grammar): 时态助词"了/着/过"不再作为未匹配词——GlossMapper 对 pos='u' 的 token 静默跳过（其语义由 NonManualMarker 承载），PosTagger 将 PARTICLES 检查提前到 VERBS 之前使"了/着/过"标注为助词而非动词
- fix(avatar): 修复手臂穿模——ClipBuilder.buildArmTracks 在 IK 解算前对轨迹点做 BodyVolume 合法性约束（手腕目标穿入躯干/头部时投影到表面），solveArmQuaternions 后检测肘部穿透并沿外法线推出，肘引导方向从硬编码改为基于 shoulder→hips 动态推导适配 A-pose；JointLimits 升级为解剖学方向限制（肩外展≤120°/前屈≤180°/后伸≤60°，肘旋前旋后≤±80°）；数据级验证 4 词条（你好/朋友/吃饭/过来）穿入数均为 0
- fix(grammar): 分词器 VERBS 补全「过」、新增 NOUNS 名词词表与 PosTagger 名词分支，修复「过来吃饭」等日常短语切分后「过」「饭」无法映射 gloss_id 致语义残缺的问题
- fix(avatar): 重构 ClipBuilder 动作生成系统——新增 buildMovementTrajectory 支持 19 种运动轨迹（弧线/圆周/折线/波浪/叩击/钩合等），新增 applyPalmOrientation 手掌朝向校正，修复 7 个新增 Movement 值落入 default 分支产生零动作、palm_orientation 字段被完全忽略的问题
- fix(avatar): VRMModel 新增模块级 loadVRMCached 缓存加载 Promise，修复 React StrictMode 双重渲染导致 VRM 模型加载 ERR_ABORTED 错误
- fix(ui): 移除 Google Fonts 引用改用系统字体栈（global.css/tailwind.config.js），并同步更新 index.html CSP，修复 fonts.googleapis.com 加载失败（ERR_ABORTED）错误
- fix(data): 规范化 24 个现有词汇的字段值，统一使用合法枚举值（handshape/movement/location/expression/palm_orientation）
- fix(avatar): 修复 VRM 初始 T-pose 问题——VRMModel 加载完成后调用 setNeutralPose 将上肢从默认 T-pose（双臂平举）调整为自然下垂姿态（上臂 X 轴 -1.2 rad ≈ -69°，肘部微屈 0.30 rad），并使用 getNormalizedBoneNode 防止 vrm.update() 覆盖旋转；setNeutralPose 用 try-catch 隔离，失败时回退到原始 T-pose 不影响 VRM 加载
- fix(avatar): 修复 NonManualMarkerOverlay 缺少 TILT/SLIGHT_BOW 枚举处理导致的类型错误
- fix(avatar): 移除 AvatarDriver 未使用的 Movement 导入
- fix(avatar): 移除 ClipBuilder 未使用的 getBoneLength 函数
- fix(avatar): 放宽 Skeleton3D 的 FINGER_LENGTHS 类型为 number[] 修复元组类型不匹配

### 📦 维护
- chore: 从 git 跟踪移除 .tmp-upload/ 目录全部 578 个临时文件（浏览器自动化调试截图与 Python 脚本），在 .gitignore 中添加 .tmp-upload/ 忽略规则
- chore(ci): CI 流水线新增"代码规范检查"步骤（npm run lint），在类型检查后执行 ESLint，防止 lint error 合并到 master
- chore(competition): 提交 TRAE AI 创造力大赛初赛 Demo 帖（https://forum.trae.cn/t/topic/167826），发布报名帖（https://forum.trae.cn/t/topic/167778），README.md 参赛信息更新为"初赛 Demo 已提交"，补充 GitHub Pages 体验地址（https://LLL-404.github.io/signbridge/）与仓库地址
- chore: 迁移文档到 docs/ 目录
- chore: 清理测试文件和临时资源
- chore(ci): 升级 GitHub Actions Node.js 版本从 20 到 24，修复部署失败
- chore: 重新生成 package-lock.json 修复依赖不同步

---

## [2026-07-06]

### ✨ 新增
- feat(avatar): VRMPose 类型定义，VRM humanoid 标准骨骼为唯一真相源
- feat(avatar): HandShape 新增 handShapeToBoneRotations 映射到 VRM 手指骨骼
- feat(avatar): VRMPoseAdapter 新旧姿态互转
- feat(avatar): IKSolver 新增 solveLeg 下肢 IK 求解
- feat(avatar): IKSolver 新增 solveSpine 躯干弯曲
- feat(avatar): AvatarDriver 新增 generateMotion 关键帧生成器（静态/直线）
- feat(avatar): generateMotion 支持弧线/圆周/折线/双手动作
- feat(avatar): MotionPlayer 支持 SignMotion 关键帧插值播放
- feat(avatar): VRMModel 新增 VRMPose 驱动路径，含 IK 反算和手形驱动
- feat(avatar): Skeleton3D 新增 applyVRMPose 适配新骨骼结构
- feat(avatar): 接入 VRM 新骨骼管线到 UI 流程，VRM 模型正式驱动
- feat: 生成项目 Code Wiki 文档

### 🔧 修复
- fix(avatar): 骨骼链正确连接——世界四元数+父逆，关节不再断裂
- fix(avatar): 三维坐标全面明确化——分区间缩放 + 人体测量学修正
- fix(avatar): 坐标体系明确化——相对 hips 归一化偏移 + 模型真实骨骼缩放
- fix(avatar): IK 坐标体系与模型真实几何对齐，修复动作不规范
- fix(avatar): VRM 模型路径适配 BASE_URL，修复 GitHub Pages 子路径 404
- fix(avatar): 修复 Task 2/3/8 遗留的预存编译错误

### 📦 维护
- chore: VRM 骨骼重建完成，全量测试通过并部署
- chore: 重新触发 GitHub Pages 部署（修复双 run 并发冲突）
- ci: 部署仅在 main/master 触发，避免 branch 推送产生失败 run
- ci: 重新触发 Pages 部署

---

## [2026-07-04]

### ✨ 新增
- feat: 用 CapsuleGeometry 重构 3D 人体，更圆润自然
- feat: 生成项目 Code Wiki 文档

### 🔧 修复
- fix: 修复 VRM 骨骼映射四个核心问题
- fix: 3D 模式响应式相机，修复手机端和电脑端模型显示不一致
- fix: 移除语音输入，重构 3D 骨骼层级确保关节连接到位

---

## [2026-07-03]

### 🔧 修复
- fix: 修复语音识别国内不可用问题，文字输入为主 + 按住说话可选

---

## [2026-07-02]

### ✨ 新增
- feat: 移动端响应式适配优化

---

## [2026-07-01]

### ✨ 新增
- feat: 添加 GitHub Pages 自动部署配置
- feat: 添加 BytePlus Pages 部署配置
- feat: 生成项目 Code Wiki 文档

### 🔧 修复
- fix: 移除未使用的 isLoading 变量，修复 TypeScript 编译错误
- fix: 升级 GitHub Actions Node.js 版本到 20，修复构建失败

### ⚡ 性能
- perf: 优化首屏加载速度，提升用户体验

---

## [2026-06-30]

### ✨ 新增
- feat: L3 VRM 模型升级，非手动标记系统，参赛材料

---

## [2026-06-29]

### ✨ 新增
- feat(avatar): L3 — integrate VRM standard avatar model with @pixiv/three-vrm

### 🔧 修复
- fix: AvatarCanvas graceful WebGL fallback with error boundary protection