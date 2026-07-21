# 肘部穿透修正不完整 Spec

## Why

语音转手语播放时，VRM 模型的上臂偶尔穿入躯干。根因在 `ClipBuilder.ts` 的 `solveArmQuaternions` 解析法路径：检测到肘部穿入躯干后，只修正了 `correctedElbowPos` 用于前臂方向计算（第 593 行 `forearmDir = W - correctedElbowPos`），但上臂四元数 `upperQuat`（第 573 行）仍基于未修正的 `upperArmDir`，导致上臂骨骼仍指向穿入躯干的方向。FABRIK 路径（IK_MODE='fabrik'/'constraint'）则完全无肘部修正。

## What Changes

- 修正解析法路径（IK_MODE='analytic'）的肘部穿透处理：检测到穿透后，用 `correctedElbowPos` 重新计算 `upperArmDir`（指向修正后肘部位置），并重新生成 `upperQuat`，使上臂旋转与修正后的肘部位置一致
- 修正 FABRIK 路径（IK_MODE='fabrik'/'constraint'）的肘部穿透处理：检测到穿透后，同样基于修正后的肘部位置重新计算上臂四元数
- 确保修正后的 `upperQuat` 仍经过肩关节角度约束（`constrainShoulderByDirection`），避免修正引入超出生理范围的动作

## Impact

- Affected specs: 无（纯 bug 修复）
- Affected code:
  - `frontend/src/modules/avatar/ClipBuilder.ts` — `solveArmQuaternions` 函数的解析法路径（第 579-598 行）和 FABRIK 路径（第 486-497 行）
- Affected docs: `CHANGELOG.md` 记录变更
- 风险:
  - 重新计算 `upperArmDir` 会改变 `shoulderLift` 角度的几何含义，需确保肩关节约束仍正确应用
  - 修正后的上臂方向可能与前臂方向不严格共面（肘部位置被投影到表面），但视觉上比穿入躯干更可接受
  - FABRIK 路径当前非默认（IK_MODE='analytic'），修改需保证不破坏现有测试

## ADDED Requirements

### Requirement: 肘部穿透时上臂旋转同步修正

当 IK 解算检测到肘部位置穿入躯干包络体时，系统 SHALL 不仅修正前臂方向，还需重新计算上臂旋转四元数，使上臂骨骼指向修正后的肘部位置，避免上臂穿入躯干。

#### Scenario: 解析法路径穿透修正
- **WHEN** IK_MODE='analytic' 且 `solveArmQuaternions` 检测到肘部穿入躯干（`elbowPenetrated=true`）
- **THEN** `upperQuat` 基于 `correctedElbowPos`（投影到躯干表面的肘部位置）重新计算
- **AND** 重新计算的 `upperQuat` 仍经过 `constrainShoulderByDirection` 约束

#### Scenario: FABRIK 路径穿透修正
- **WHEN** IK_MODE='fabrik' 或 'constraint' 且检测到肘部穿入躯干
- **THEN** 返回的 `upper` 四元数基于修正后的肘部位置重新计算

### Requirement: 穿模修正不破坏现有动画质量

穿模修正 SHALL NOT 导致动画抖动或跳变。修正后的相邻帧四元数差异 SHALL 在时序平滑后处理（SLERP 阈值 60°）的可处理范围内。

#### Scenario: 修正后时序连续性
- **WHEN** 某帧发生穿透修正
- **THEN** 相邻帧的 `upperQuat` / `lowerQuat` 旋转差异不因修正而显著增大（仍受第 796-807 行的 SLERP 平滑保护）

## MODIFIED Requirements

无

## REMOVED Requirements

无
