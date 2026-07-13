# IK 关节角度限制 Spec

## Why
当前 IK 解算（`solveArmQuaternions`）使用 `setFromUnitVectors` 计算肩部和肘部四元数，该方法返回最短旋转路径但不考虑人类关节活动范围。人类肘关节是铰链关节（只能单向弯曲 0°-150°），肩关节有最大旋转角度限制。缺少约束导致关节出现反向弯曲、过度旋转等不自然动作。

## What Changes
- 在 `solveArmQuaternions` 中新增肘关节铰链约束：将肘部旋转投影到铰链轴上，限制单向弯曲且角度 ≤ 150°
- 在 `solveArmQuaternions` 中新增肩关节角度约束：限制最大旋转角度 ≤ 170°，防止手臂穿过身体到另一侧

## Impact
- Affected specs: `fix-sign-clipping`（穿模修复的基础上进一步约束关节）、`fix-ik-bone-rest-direction`（IK 解算逻辑增强）
- Affected code: [ClipBuilder.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts) — `solveArmQuaternions` 函数

## ADDED Requirements

### Requirement: 肘关节铰链约束
`solveArmQuaternions` 返回的肘部四元数（`lower`）必须满足人类肘关节的铰链约束：只在铰链轴方向上旋转，且单向弯曲，角度限制在 [0°, 150°]。

#### Scenario: 肘部不反向弯曲
- **WHEN** IK 解算结果让前臂向下弯曲（反向弯曲方向）
- **THEN** 肘部旋转被钳制为 0°（伸直状态），不出现反向弯曲

#### Scenario: 肘部弯曲角度不超限
- **WHEN** IK 解算结果的肘部弯曲角度 > 150°
- **THEN** 弯曲角度被钳制为 150°，前臂不会过度折叠碰到上臂

#### Scenario: 肘部只在铰链平面内旋转
- **WHEN** IK 解算结果包含非铰链轴方向的旋转分量
- **THEN** 非铰链分量被剔除，肘部只在铰链平面内弯曲

### Requirement: 肩关节角度约束
`solveArmQuaternions` 返回的肩部四元数（`upper`）的旋转角度不得超过 170°，防止手臂旋转到身体另一侧。

#### Scenario: 肩部旋转不超限
- **WHEN** IK 解算结果的肩部旋转角度 > 170°
- **THEN** 旋转角度被钳制为 170°，手臂不会穿过身体到另一侧

## MODIFIED Requirements

### Requirement: solveArmQuaternions 返回值约束
在 `solveArmQuaternions` 返回 `{ upper, lower }` 之前，依次应用：
1. 肩关节约束：如果 `upper` 的旋转角度 > 170°，钳制到 170°
2. 肘关节铰链约束：
   - 计算铰链轴：`hingeAxis = upperRestDir × (0,1,0)`（T-pose 下上臂方向与上方向的叉积）
   - 从 `lower` 提取旋转轴和角度
   - 将旋转投影到铰链轴方向（只保留铰链轴分量）
   - 根据侧别确定弯曲正方向：右臂正角度为弯曲，左臂负角度为弯曲
   - 钳制弯曲角度到 [0°, 150°]（右臂）或 [-150°, 0°]（左臂）
   - 用铰链轴和钳制后的角度重建 `lower`
