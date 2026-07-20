# 修复 IK Bone Rest Direction 不匹配 Spec

## Why

`fix-animation-mixer-normalized-bone` 修复后模型终于能动，但手语动作不规范、轨迹错误。

根因调查确认：`IKSolver.ts` 硬编码 `BONE_REST_DIR = (0, -1, 0)`（第 25 行），假设骨骼在 rest pose 时沿 -Y 方向延伸（Skeleton3D 的"手臂下垂"约定）。但 VRM normalized bone 的 rest pose 是 T-pose（双臂水平外伸），`rightLowerArm.position ≈ (0.26, 0, 0)`，即 rightUpperArm 的实际"指向"是 +X，不是 -Y。

这导致两个问题：
1. **肩部旋转错误**：`shoulderQuat = setFromUnitVectors((0,-1,0), upperArmDir)` 把 -Y 旋转到目标方向，但实际应把 +X 旋转到目标方向。手臂指向完全错误。
2. **肘部铰链轴错误**：`elbowRotation: { x: elbowAngle, y: 0, z: 0 }` 假设肘部绕本地 X 轴弯曲。但当 lowerArm rest dir = (1,0,0) 时，肘部弯曲（前臂向内/向上抬）应绕 Z 轴，不是 X 轴。肘部弯曲方向错误（可能向后弯）。

参考证据：
- `IKSolver.ts` 第 8-9 行注释："shoulder 骨骼在旋转为 0 时，local -Y 方向指向 elbow"——这是 Skeleton3D 约定，VRM 不遵循
- `IKSolver.ts` 第 25 行：`const BONE_REST_DIR = new THREE.Vector3(0, -1, 0);`——硬编码
- `IKSolver.ts` 第 92-95 行：`shoulderQuat = setFromUnitVectors(BONE_REST_DIR, upperArmDir)`——用错误的 rest dir
- `IKSolver.ts` 第 125 行：`elbowRotation: { x: elbowAngle, y: 0, z: 0 }`——硬编码 X 轴铰链
- [VRMHumanoidRig 源码第 75-90 行](https://github.com/pixiv/three-vrm/blob/master/packages/three-vrm-core/src/humanoid/VRMHumanoidRig.ts)：normalized bone 的 `position = boneWorldPos - parentBoneWorldPos`，T-pose 下手臂水平外伸
- `ClipBuilder.ts` 第 417 行注释"rest pose 下本地=scene 方向"——承认 normalized bone rest = identity，但未处理 rest direction 差异

## What Changes

- 在 `ClipBuilder.ts` 的 `buildArmTracks` 中动态获取 normalized bone 的实际 rest direction：
  - `upperRestDir = lowerNode.position.clone().normalize()`（rightUpperArm 的"指向"）
  - `lowerRestDir = handNode.position.clone().normalize()`（rightLowerArm 的"指向"）
- 新增私有函数 `solveArmQuaternions`，接收 rest direction 参数，直接返回肩肘四元数（不经过欧拉角，避免铰链轴假设）
- 用 `setFromUnitVectors(actualRestDir, targetDir)` 计算肩肘旋转，适配任意 rest pose（T-pose / A-pose）
- 不修改 `IKSolver.ts`（保持向后兼容，不影响其他调用方如 Skeleton3D）

## Impact

- Affected specs: `fix-animation-mixer-normalized-bone`（动作能动但轨迹不对的后续修复）
- Affected code:
  - `frontend/src/modules/avatar/ClipBuilder.ts`（新增 `solveArmQuaternions` 函数，修改 `buildArmTracks` 调用新函数）
  - 不影响 `IKSolver.ts`、`VRMAnimator.ts`、`VRMModel.tsx`、`AvatarDriver.ts`

## ADDED Requirements

### Requirement: IK 解算必须使用实际 Bone Rest Direction

ClipBuilder 生成手臂轨道时，必须从 normalized bone 的子骨骼 `position` 动态获取实际 rest direction，**禁止**假设固定的 `(0,-1,0)` 方向。

#### Scenario: 肩部旋转正确

- **WHEN** ClipBuilder 调用 IK 解算计算肩部四元数
- **THEN** 使用 `lowerNode.position.clone().normalize()` 作为 upperArm 的 rest direction
- **AND** `shoulderQuat = setFromUnitVectors(upperRestDir, upperArmDir)`
- **AND** 手臂正确指向目标方向（从肩到肘的方向）

#### Scenario: 肘部旋转正确

- **WHEN** ClipBuilder 调用 IK 解算计算肘部四元数
- **THEN** 使用 `handNode.position.clone().normalize()` 作为 lowerArm 的 rest direction
- **AND** `elbowQuat = setFromUnitVectors(lowerRestDir, forearmLocalDir)`
- **AND** 肘部正确弯曲（前臂从"延续上臂方向"弯曲到指向手腕目标）
- **AND** 肘部向前弯曲（不是向后）

#### Scenario: 适配任意 rest pose

- **WHEN** VRM 模型使用 T-pose（手臂水平外伸）或 A-pose（手臂略微下垂）
- **THEN** 动态获取的 rest direction 自动适配模型实际姿势
- **AND** IK 解算结果正确，无需手动调整

### Requirement: IK 解算直接返回四元数

新增 `solveArmQuaternions` 函数直接返回肩肘四元数（`THREE.Quaternion`），不经过欧拉角转换，避免铰链轴假设。

#### Scenario: 无铰链轴假设

- **WHEN** `solveArmQuaternions` 计算肘部旋转
- **THEN** 用 `setFromUnitVectors(lowerRestDir, forearmLocalDir)` 直接计算四元数
- **AND** 不假设肘部绕特定轴（X/Y/Z）弯曲
- **AND** 肘部弯曲方向由 `forearmLocalDir` 与 `lowerRestDir` 的几何关系决定

## MODIFIED Requirements

### Requirement: buildArmTracks 函数

`buildArmTracks` 函数改为调用 `solveArmQuaternions`（新增私有函数），不再调用 `IKSolver.solve`。

修改点：
1. 新增获取 `upperRestDir` 和 `lowerRestDir` 的逻辑
2. 调用 `solveArmQuaternions` 替代 `solveArm`
3. 直接使用返回的四元数填充轨道值，不再经过 `setFromEuler` 转换
4. 骨骼长度改用 `lowerNode.position.length()` 和 `handNode.position.length()`（与 rest direction 来源一致）
