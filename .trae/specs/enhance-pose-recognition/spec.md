# 人物姿态控制与识别增强 Spec

## Why

SignBridge 当前的姿态管线存在几个核心瓶颈：仅支持手势识别（无全身姿态）、手势识别依赖简单几何规则（无法处理连续手语）、运动平滑使用欧拉角线性插值（导致旋转抖动）、VRM 骨骼操作未使用标准化姿态 API（跨模型兼容性差）。基于 2024-2025 年最新技术调研（MediaPipe Holistic、Kalidokit、ST-GCN、One Euro Filter + SLERP），可以在现有架构上分阶段提升姿态控制精度和手势识别能力。

## What Changes

### 一、全身姿态估计接入
- 集成 MediaPipe PoseLandmarker（33 点身体 + 21×2 手部 + 468 面部），替代当前仅使用 GestureRecognizer 的单手追踪方案
- 在 Web Worker 中运行姿态推理，避免阻塞主线程
- 新增 `PoseEstimator` 模块，统一输出 `PoseLandmarkResult`（body/hands/face）

### 二、Kalidokit IK 解算集成
- 引入 Kalidokit 库，将 MediaPipe 关键点转换为 VRM 骨骼旋转
- 替代当前自定义 `IKSolver` 中对实时追踪数据的处理（保留 `IKSolver` 用于离线动作生成）
- Kalidokit 的 `Pose.solve()` + `Hand.solve()` 已针对 MediaPipe 优化，精度和稳定性优于手写 IK

### 三、运动平滑升级
- 将 `Smoother.ts` 中的 `slerpRotation` 从欧拉角线性插值升级为四元数 SLERP
- 新增 `QuaternionSmoother`：对每个骨骼维护独立的四元数 One Euro Filter
- 保留现有 `BoneSmoother`（欧拉角版本）用于兼容，新代码使用四元数版本

### 四、VRM 标准化姿态 API 迁移
- `VRMAdapter.applyPose()` 从 `getRawBoneNode()` 迁移到 `getNormalizedBoneNode()` + `setNormalizedPose()`
- 解决不同 VRM 模型 rest pose 差异导致的姿态偏移问题
- 修正 `vrm.update()` 调用时序：骨骼操作必须在 `vrm.update()` 之后

### 五、ST-GCN 手势识别原型
- 新增 `STGCNRecognizer` 实现 `Recognizer` 接口，基于骨骼关键点时序图卷积
- 使用 MediaPipe 手部 21 关键点构建空间图，时间维度用 TCN 提取时序特征
- 初期支持 10 个基础手势（与现有 `RuleRecognizer` 手势库对齐），后续可扩展

## Impact

- **Affected specs**: `cleanup-and-restructure`（无冲突，文件整理已先行）
- **Affected code**:
  - `frontend/src/modules/avatar/Smoother.ts` — 新增四元数平滑
  - `frontend/src/modules/avatar/VRMAdapter.ts` — 标准化姿态 API 迁移
  - `frontend/src/modules/avatar/IKSolver.ts` — 保留，新增 Kalidokit 集成层
  - `frontend/src/modules/recognition/` — 新增 `PoseEstimator.ts`、`STGCNRecognizer.ts`
  - `frontend/src/hooks/useHandTracking.ts` — 升级为全身追踪 hook
  - `frontend/package.json` — 新增 `kalidokit`、`@mediapipe/tasks-vision`（已有）依赖
- **Breaking changes**: 无（所有新功能通过新模块/可选路径接入，现有 `RuleRecognizer` 和 `IKSolver` 保留）

## ADDED Requirements

### Requirement: 全身姿态估计
系统 SHALL 通过 MediaPipe PoseLandmarker 在 Web Worker 中实时估计全身姿态（身体 33 点 + 手部 21×2 点 + 面部 468 点），输出统一的 `PoseEstimate` 数据结构。

#### Scenario: 实时全身追踪
- **WHEN** 用户开启摄像头并启动姿态追踪
- **THEN** 系统以 ≥25 FPS 输出包含 body、hands、face 关键点的 `PoseEstimate`
- **AND** 推理在 Web Worker 中执行，主线程帧率不受影响

#### Scenario: 部分遮挡容错
- **WHEN** 用户身体部分被遮挡（如手部离开画面）
- **THEN** 被遮挡部位的关键点 confidence 低于 0.5，系统保留上次有效值并标记 `lowConfidence: true`

### Requirement: Kalidokit IK 解算
系统 SHALL 使用 Kalidokit 将 MediaPipe 关键点转换为 VRM 骨骼旋转（欧拉角），作为实时驱动的主要 IK 解算路径。

#### Scenario: 实时驱动 VRM
- **WHEN** 收到 `PoseEstimate` 数据
- **THEN** 通过 `Kalidokit.Pose.solve()` 和 `Kalidokit.Hand.solve()` 计算骨骼旋转
- **AND** 输出的旋转值经过四元数平滑后应用到 VRM 模型

#### Scenario: 离线动作生成保留
- **WHEN** 系统根据 SignGloss 生成预定义动作（非实时追踪）
- **THEN** 继续使用现有 `IKSolver.solve()` 进行 2 段 IK 求解（不经过 Kalidokit）

### Requirement: 四元数运动平滑
系统 SHALL 对骨骼旋转使用四元数 SLERP + One Euro Filter 进行平滑，替代当前的欧拉角线性插值。

#### Scenario: 旋转平滑无抖动
- **WHEN** VRM 模型接收连续帧骨骼旋转数据
- **THEN** 旋转过渡通过四元数 SLERP 插值
- **AND** 使用 One Euro Filter 自适应平滑（快速运动时减少平滑，慢速时增加平滑）

#### Scenario: 动作切换无跳变
- **WHEN** 动作序列切换到新动作
- **THEN** 平滑滤波器调用 `reset()` 清除历史状态，避免过渡延迟

### Requirement: VRM 标准化姿态
`VRMAdapter` SHALL 使用 VRM Humanoid 的标准化姿态 API（`getNormalizedBoneNode` / `setNormalizedPose`）驱动骨骼，确保跨模型兼容性。

#### Scenario: 跨模型姿态正确
- **WHEN** 加载不同 rest pose 的 VRM 模型（如 T-pose vs A-pose）
- **THEN** 通过标准化姿态空间应用旋转，模型表现一致
- **AND** 不依赖 `Retargeter.ts` 中的手动 rest pose 差异校正

#### Scenario: vrm.update() 时序正确
- **WHEN** 每帧渲染循环执行
- **THEN** 先调用 `vrm.update(deltaTime)` 更新 spring bone 和 lookAt
- **THEN** 再通过 `setNormalizedPose()` 应用骨骼旋转

### Requirement: ST-GCN 手势识别
系统 SHALL 提供 `STGCNRecognizer`，基于手部骨骼关键点的时空图卷积网络识别手势，作为 `RuleRecognizer` 的高精度替代。

#### Scenario: 识别基础手势
- **WHEN** 用户做出 10 种基础手势之一（握拳、张开、食指指、胜利、点赞等）
- **THEN** `STGCNRecognizer` 输出 `ClassificationResult`，准确率 ≥ 90%
- **AND** 单帧推理延迟 < 30ms

#### Scenario: 与规则识别器共存
- **WHEN** `STGCNRecognizer` 模型未加载或初始化失败
- **THEN** 系统回退到 `RuleRecognizer`，功能不受影响

## MODIFIED Requirements

### Requirement: 手部追踪 Hook
`useHandTracking` hook SHALL 升级为 `usePoseTracking`，支持全身姿态追踪，同时保持对手势识别模块的数据供给。

#### Scenario: 向下兼容
- **WHEN** 现有组件引用 `useHandTracking`
- **THEN** 通过 re-export 保持接口兼容
- **AND** 新的 `usePoseTracking` 额外提供 body 和 face 数据

### Requirement: 识别器组合
`CompositeRecognizer` SHALL 支持将 `STGCNRecognizer` 和 `RuleRecognizer` 组合使用，ST-GCN 优先，规则匹配兜底。

#### Scenario: 识别器优先级
- **WHEN** `STGCNRecognizer` 返回高置信度结果（confidence ≥ 0.8）
- **THEN** 使用 ST-GCN 结果
- **WHEN** `STGCNRecognizer` 返回低置信度结果
- **THEN** 回退到 `RuleRecognizer` 进行规则匹配
