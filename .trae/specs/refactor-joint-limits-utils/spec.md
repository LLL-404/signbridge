# 关节角度限制工具函数提取 Spec

## Why
当前关节约束逻辑（肩关节角度钳制 + 肘关节铰链约束）内联在 `solveArmQuaternions` 中，无法在其他骨骼动作（如膝盖、挥手、抱拳）中复用。需要提取成独立工具函数，通过参数化铰链轴和角度范围，支持不同关节的约束需求。

## What Changes
- 新建 `JointLimits.ts`，提取 3 个通用工具函数：
  - `clampRotationAngle`：球窝关节角度约束（肩、髋等）
  - `constrainHingeJoint`：铰链关节约束（肘、膝等）
  - `computeHingeAxis`：根据骨骼 rest direction 和参考方向计算铰链轴
- 在 `ClipBuilder.ts` 的 `solveArmQuaternions` 中用工具函数替换内联约束逻辑

## Impact
- Affected specs: `fix-ik-joint-limits`（约束逻辑来源，行为不变仅重构位置）
- Affected code: 新建 [JointLimits.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/JointLimits.ts)，修改 [ClipBuilder.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts)

## ADDED Requirements

### Requirement: 球窝关节角度约束函数
`clampRotationAngle(quat, maxAngleRad)` 限制四元数旋转角度不超过最大值，适用于肩关节、髋关节等球窝关节。

#### Scenario: 角度未超限时不修改
- **WHEN** 四元数的旋转角度 ≤ maxAngleRad
- **THEN** 原四元数不变，直接返回

#### Scenario: 角度超限时钳制
- **WHEN** 四元数的旋转角度 > maxAngleRad
- **THEN** 保留旋转轴方向，角度钳制到 maxAngleRad，返回新四元数

### Requirement: 铰链关节约束函数
`constrainHingeJoint(restDir, targetDir, hingeAxis, minAngleRad, maxAngleRad)` 将旋转投影到铰链轴上并限制弯曲角度范围，适用于肘关节、膝关节等铰链关节。

#### Scenario: 正向弯曲在范围内
- **WHEN** 旋转投影角度在 [minAngleRad, maxAngleRad] 范围内
- **THEN** 按铰链轴和投影角度构建四元数返回

#### Scenario: 反向弯曲被钳制
- **WHEN** 旋转投影角度 < minAngleRad（如负值表示反向弯曲）
- **THEN** 角度钳制为 minAngleRad（通常为 0，即伸直状态）

#### Scenario: 弯曲过度被钳制
- **WHEN** 旋转投影角度 > maxAngleRad
- **THEN** 角度钳制为 maxAngleRad

### Requirement: 铰链轴计算函数
`computeHingeAxis(boneRestDir, referenceDir)` 根据骨骼 rest direction 和参考方向计算铰链轴：`hingeAxis = boneRestDir × referenceDir`（归一化）。

#### Scenario: 手臂铰链轴
- **WHEN** boneRestDir = 上臂方向，referenceDir = (0,1,0)（UP）
- **THEN** 返回垂直于上臂和上方向的铰链轴（右臂 ≈ (0,0,-1)）

#### Scenario: 腿部铰链轴
- **WHEN** boneRestDir = 大腿方向，referenceDir = (0,0,1)（前方）
- **THEN** 返回垂直于大腿和前方的铰链轴（膝关节弯曲轴）

## MODIFIED Requirements

### Requirement: solveArmQuaternions 约束调用
`solveArmQuaternions` 中的内联约束逻辑替换为工具函数调用：
1. 肩关节：`upperQuat = clampRotationAngle(upperQuat, degToRad(170))`
2. 肘关节铰链轴：`hingeAxis = computeHingeAxis(upperRestDir, UP)`
3. 肘关节：`lowerQuat = constrainHingeJoint(lowerRestDir, forearmLocalDir, hingeAxis, 0, degToRad(150))`
行为与原内联实现完全一致，仅代码位置变化。
