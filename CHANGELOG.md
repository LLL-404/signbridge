# 变更日志

所有重要的项目变更都会记录在此文件中。

格式基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/)。

---

## [Unreleased]

### ✨ 新增
- feat: 添加 pre-commit 钩子强制更新变更日志

### 🔧 修复
- 暂无

### 📦 维护
- 暂无

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