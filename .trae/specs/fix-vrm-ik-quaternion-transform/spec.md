# VRM IK 四元数变换修复 Spec

## Why
用户输入"你好"后模型"只笑不动"——表情生效证明 VRMPose 已到达渲染层，但手臂完全不动。深度代码审查定位到 `applyLimbIK` 函数中两个关键 bug：

1. **目标世界四元数计算错误**：`upperTargetWorldQuat = upperRestQuat.clone().multiply(upperDeltaQuat)` 语义错误。`upperDeltaQuat` 已经是"把 (-Y) 转到 upperArmDir"的世界旋转，再左乘 `upperRestQuat` 会得到错误结果。正确应为 `setFromUnitVectors(upperRestDir, upperArmDir)`，即"把 rest 方向转到目标方向"。

2. **坐标体系不匹配**：IK 解算输入使用 scene 本地坐标（`scene.worldToLocal`），但 `getRestWorldDir` 返回世界坐标（`getWorldPosition`）。两者混合运算导致解算结果在错误的坐标系下。

3. **前臂方向未重新计算**：`lowerTargetWorldQuat = lowerRestQuat.clone().multiply(lowerDeltaQuat)` 同样错误，且 `lowerDeltaQuat` 只是绕 X 轴的肘部屈曲角，没有考虑上臂旋转后的前臂实际方向。

## What Changes
- 修改 `applyLimbIK` 函数签名：新增 `shoulderPos` 和 `wristTargetPos` 参数（世界坐标），用于重新计算前臂方向
- 修复 `upperTargetWorldQuat` 计算：使用 `setFromUnitVectors(upperRestDir, upperArmDir)` 直接构建
- 修复 `lowerTargetWorldQuat` 计算：从 `shoulderPos` 和 `wristTargetPos` 重新推导 `forearmDir`，使用 `setFromUnitVectors(lowerRestDir, forearmDir)` 构建
- 统一坐标体系：IK 解算输入改为世界坐标（移除 `scene.worldToLocal` 转换），与 `getRestWorldDir` 保持一致
- 从 IK 解算的 `shoulderRotation` 反推 `upperArmDir`：`upperArmDir = (0,-1,0).applyQuaternion(upperDeltaQuat)`

## Impact
- Affected code: `frontend/src/components/avatar/VRMModel.tsx`（`applyVRMPose` 和 `applyLimbIK` 函数）
- Affected specs: `fix-vrm-arm-movement`（上一个 spec 添加的诊断工具保留，本 spec 修复核心算法）

## MODIFIED Requirements

### Requirement: applyLimbIK 目标世界四元数计算
`applyLimbIK` SHALL 使用 `setFromUnitVectors(restDir, targetDir)` 直接构建目标世界四元数，而非通过 `upperRestQuat × upperDeltaQuat` 乘法。`upperArmDir` 通过 `(0,-1,0).applyQuaternion(upperDeltaQuat)` 从 IK 解算结果反推；`forearmDir` 通过 `(wristTargetPos - elbowPos).normalize()` 重新计算，其中 `elbowPos = shoulderPos + upperArmDir × upperArmLen`。

#### Scenario: 上臂目标旋转计算
- **WHEN** IK 解算返回 `shoulderRotation` 且 `upperRestDir` 已从模型读取
- **THEN** `upperDeltaQuat = setFromEuler(shoulderRotation)`
- **AND** `upperArmDir = (0,-1,0).applyQuaternion(upperDeltaQuat)`
- **AND** `upperTargetWorldQuat = setFromUnitVectors(upperRestDir, upperArmDir)`

#### Scenario: 前臂目标旋转计算
- **WHEN** `shoulderPos`、`wristTargetPos`、`upperArmDir`、`upperArmLen` 已知
- **THEN** `elbowPos = shoulderPos + upperArmDir × upperArmLen`
- **AND** `forearmDir = (wristTargetPos - elbowPos).normalize()`
- **AND** `lowerTargetWorldQuat = setFromUnitVectors(lowerRestDir, forearmDir)`

### Requirement: IK 解算坐标体系统一
`applyVRMPose` 中的 IK 调用 SHALL 使用世界坐标传入 `solveArm`，与 `getRestWorldDir` 返回的世界坐标保持一致。移除 `scene.worldToLocal` 转换，直接使用 `getBoneWorldPos` 返回的世界位置和 `hipsWorld + worldOffset` 计算的目标世界位置。

#### Scenario: 右手 IK 调用
- **WHEN** `pose.ikTargets.rightHand` 存在且骨骼节点齐全
- **THEN** `shoulderWorld = getBoneWorldPos(rightUpperArm)`
- **AND** `targetWorld = hipsWorld + (scaledOffset.applyQuaternion(sceneQuat))`
- **AND** `solveArm(shoulderWorld, targetWorld, L1, L2, 'right')`
- **AND** `applyLimbIK(..., shoulderWorld, targetWorld, L1, ...)`
