# 手语动作穿模修复 Spec

## Why
输入"你好"生成手语动作时，模型手臂穿入身体（穿模）。根因是 `LOCATION_OFFSETS` 中各手部位置的 Z 值（前方偏移）偏小，手腕目标离身体太近；同时 IK 解算中肘部引导方向的 Z 分量不足，导致肘部向后穿入躯干。

## What Changes
- 增大 `LOCATION_OFFSETS` 中所有位置的 Z 值（前方偏移），让手腕目标远离身体表面，避免穿胸/穿腹
- 增大 `solveArmQuaternions` 中肘部引导方向 `reference` 的 Z 分量，让肘部更向前方伸出，避免向后穿入躯干

## Impact
- Affected specs: `fix-sign-coordinate-system`（坐标转换逻辑不变，仅调整偏移量数值）
- Affected code: [ClipBuilder.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts) — `LOCATION_OFFSETS` 常量和 `solveArmQuaternions` 函数

## ADDED Requirements

### Requirement: 手部位置前方偏移防穿模
`LOCATION_OFFSETS` 中每个 `HandLocation` 的 Z 值（前方偏移）应足够大，确保手腕目标在身体表面前方，不穿透躯干。

#### Scenario: 胸前位置不穿模
- **WHEN** 手语动作将手腕定位到 `chest_center`
- **THEN** 手腕 Z 坐标（相对 hips）至少 0.25m，手腕在胸部表面前方

#### Scenario: 面部位置不穿模
- **WHEN** 手语动作将手腕定位到 `face_level`
- **THEN** 手腕 Z 坐标（相对 hips）至少 0.28m，手腕在面部前方

### Requirement: 肘部引导方向防穿模
`solveArmQuaternions` 中肘部引导方向 `reference` 向量的 Z 分量应足够大，确保肘部向前方伸出而非向后穿入躯干。

#### Scenario: 右臂肘部不穿入身体
- **WHEN** 右手手腕目标在身体正中线（X≈0）且 Z 值较小
- **THEN** 肘部位置在身体前方（Z > 0），不穿入躯干

## MODIFIED Requirements

### Requirement: LOCATION_OFFSETS 数值
`LOCATION_OFFSETS` 各位置的 Z 值从当前偏小值增大到防穿模安全值：

| HandLocation | 原 Z | 新 Z | 说明 |
|---|---|---|---|
| NEUTRAL | 0.10 | 0.18 | 中性位置，手在腰前 |
| WAIST_LEVEL | 0.12 | 0.20 | 腰部高度 |
| ABDOMEN_LEVEL | 0.20 | 0.25 | 腹部高度 |
| CHEST_CENTER | 0.16 | 0.25 | 胸前正中 |
| CHEST_LEFT | 0.16 | 0.25 | 胸前左侧 |
| CHEST_RIGHT | 0.16 | 0.25 | 胸前右侧 |
| SHOULDER_LEFT | 0.06 | 0.12 | 肩部左侧 |
| SHOULDER_RIGHT | 0.06 | 0.12 | 肩部右侧 |
| CHIN_LEVEL | 0.18 | 0.25 | 下巴高度 |
| MOUTH_LEVEL | 0.20 | 0.26 | 嘴部高度 |
| FACE_LEVEL | 0.22 | 0.28 | 面部高度 |
| EYE_LEVEL | 0.20 | 0.26 | 眼部高度 |
| FOREHEAD_LEVEL | 0.16 | 0.22 | 额头高度 |

### Requirement: 肘部引导方向
`solveArmQuaternions` 中 `reference` 向量从 `(sideBias, -1.0, 0.3)` 改为 `(sideBias, -1.0, 0.6)`，增大 Z 分量让肘部更向前方伸出。
