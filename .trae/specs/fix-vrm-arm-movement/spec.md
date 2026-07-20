> **STATUS: DEPRECATED** — 被 rewrite-avatar-with-animation-mixer 取代

# VRM 手臂动作不可见修复 Spec

## Why
用户输入"你好"后模型只笑但手臂完全不动。深度代码审查确认管道端到端通畅（文本→词汇映射→关键帧生成→VRMPose 插值→VRMModel 接收），表情数据成功应用证明 VRMPose 已到达渲染层。但 `applyVRMPose` 中的 IK 解算环节未产生可见的手臂骨骼旋转。根因有三：(1) `VRMModel` 的 `useEffect` 每帧调用 `smoother.reset()` 导致平滑器状态丢失和性能浪费；(2) `applyVRMPose` 中 IK 解算路径缺乏运行时诊断日志，无法定位是 IK 输入错误、解算错误还是骨骼写入错误；(3) `getRestWorldDir` 可能因子骨骼 `matrixWorld` 未更新而返回错误的 rest 方向，导致四元数变换基准错误。

## What Changes
- 修复 `VRMModel` 的 `useEffect` 依赖：仅在 `vrmPose` 从 null↔非null 切换时 reset smoother，而非每帧 reset
- 在 `applyVRMPose` 的 IK 解算路径添加运行时诊断日志（ikTargets 存在性、骨骼查找结果、IK 解算旋转值、最终写入旋转值）
- 修复 `getRestWorldDir`：在读取子骨骼世界位置前调用 `updateWorldMatrix` 确保矩阵最新
- 添加 IK 目标可视化调试模式：在 3D 场景中用小球体显示 IK 目标位置，验证坐标是否正确
- 添加直接骨骼旋转测试：在 `applyVRMPose` 中添加固定旋转注入（绕 X 轴 -1.5 弧度），验证骨骼是否能被旋转

## Impact
- Affected code: `VRMModel.tsx`, `AvatarDriver.ts`（仅日志）
- Affected specs: fix-sign-animation-pipeline

## ADDED Requirements

### Requirement: IK 诊断日志
`applyVRMPose` SHALL 在 IK 解算路径输出诊断日志，包括：ikTargets 是否存在、骨骼节点是否找到、IK 解算结果旋转值、最终写入骨骼的旋转值。日志仅在 ikTargets 存在时输出，使用 `log.debug` 避免生产环境刷屏。

#### Scenario: IK 正常执行
- **WHEN** VRMPose 包含 `ikTargets.rightHand` 且 `rightUpperArm` 骨骼存在
- **THEN** 日志输出："[VRMModel] IK rightHand target=({x},{y},{z}) shoulder=({x},{y},{z}) upperArmLen={L1} forearmLen={L2}"
- **AND** 日志输出："[VRMModel] IK result shoulderRot=({x},{y},{z}) elbowRot=({x},{y},{z})"
- **AND** 日志输出："[VRMModel] Apply upperArm quat=({x},{y},{z},{w})"

#### Scenario: 骨骼未找到
- **WHEN** VRMPose 包含 `ikTargets.rightHand` 但 `humanoid.getRawBoneNode('rightUpperArm')` 返回 null
- **THEN** 日志输出："[VRMModel] WARNING: rightUpperArm bone not found, skipping IK"

### Requirement: IK 目标可视化调试
VRMModel SHALL 支持通过 prop `showIKDebug={true}` 在 3D 场景中渲染 IK 目标位置的小球体（红色=右手，蓝色=左手），帮助验证坐标是否正确。

#### Scenario: 开启调试模式
- **WHEN** `showIKDebug` 为 true 且 VRMPose 包含 `ikTargets.rightHand`
- **THEN** 在右手 IK 目标位置渲染一个红色小球体（半径 0.02）

### Requirement: 平滑器正确重置
VRMModel SHALL 仅在播放状态切换（idle→playing 或 playing→idle）时重置 smoother，而非每帧重置。通过比较 VRMPose 的 expression 和 ikTargets 是否存在来判断状态切换。

#### Scenario: 连续播放帧
- **WHEN** 连续帧的 VRMPose 都包含 ikTargets（播放中）
- **THEN** smoother 不被重置，One-Euro Filter 正常累积平滑状态

#### Scenario: 从播放回到空闲
- **WHEN** VRMPose 从包含 ikTargets 变为不含 ikTargets（播放结束）
- **THEN** smoother 被重置一次

## MODIFIED Requirements

### Requirement: getRestWorldDir 矩阵更新
`getRestWorldDir` SHALL 在读取子骨骼世界位置前调用 `childNode.updateWorldMatrix(true, false)` 确保 `matrixWorld` 是最新的，避免使用过期矩阵导致 rest 方向错误。

#### Scenario: 首次调用
- **WHEN** `getRestWorldDir` 首次被调用获取 `rightUpperArm` 的 rest 方向
- **THEN** 先更新子骨骼世界矩阵，再计算方向向量，确保结果准确
