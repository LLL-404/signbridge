# 修复手语动作坐标系 Spec

## Why

`fix-ik-bone-rest-direction` 修复后模型能动且 rest direction 正确，但用户反馈"动作不规范，轨迹不对"。

根因调查确认：**`ClipBuilder.offsetToSceneLocalTarget` 没有处理 `vrm.scene.rotation.y = Math.PI` 导致的坐标系差异**。

证据链：
1. `VRMModel.tsx` 第 125 行：`vrm.scene.rotation.y = Math.PI`（让 VRM 模型从面朝 -Z 变为面朝 +Z，面向相机）
2. `ClipBuilder.buildArmTracks` 第 334 行：`shoulderSceneLocal = vrm.scene.worldToLocal(shoulderWorld.clone())` —— 转换到 scene 本地坐标系
3. `ClipBuilder.offsetToSceneLocalTarget` 第 208-220 行：`target = hipsSceneLocal + offset` —— 直接相加，未处理坐标系差异

**坐标系矛盾**：
- `hipsSceneLocal` / `shoulderSceneLocal` 在 scene 本地坐标系下（`worldToLocal` 已应用 `rotation.y = π` 的逆变换）
- 在 scene 本地坐标系下，模型面朝 **-Z**，"前方"是 -Z 方向，"后方"是 +Z 方向
- 但 `LOCATION_OFFSETS` 中 `CHEST_CENTER.z = 0.16`、`FACE_LEVEL.z = 0.22`（正值）语义上是"前方"（与世界坐标系一致，因为世界坐标下模型面朝 +Z）
- 直接把正值 Z 加到 `hipsSceneLocal` 上，目标位置落在 **+Z（模型后方）**，不是 -Z（前方）

**后果**：
- 手臂目标位置在模型背后，手臂向后伸（不是向前）
- 手语动作轨迹完全错误（"你好"动作手在背后移动，不是在胸前面部前方）
- 肘部弯曲方向因目标位置错误而扭曲

**验证**（以"你好"动作为例，右手从 CHEST_CENTER 到 FACE_LEVEL）：
- 修复前：目标 Z = +0.16 / +0.22（模型后方）→ 手臂向后伸 ❌
- 修复后：目标 Z = -0.16 / -0.22（模型前方）→ 手臂向前伸 ✓

**X 坐标不需要取反**：
- `LOCATION_OFFSETS` 中 `CHEST_RIGHT.x = 0.18`（正值=右侧）
- 在 scene 本地坐标系下，T-pose 右臂在 +X 方向（模型面朝 -Z 时右侧=+X），与正值一致 ✓
- `getLocationOffset` 中 NEUTRAL 位置 `dominant === 'right' ? x = 0.20`，在 scene 本地坐标系下 +X=右侧 ✓

**reference 向量不需要修改**：
- `solveArmQuaternions` 中 `reference = (sideBias, -1.0, 0.3)` 在 scene 本地坐标系下
- Y=-1.0（向下）、Z=0.3（后方）让肘部向"下后方"弯曲
- 手语动作中抬手时肘部自然向下/稍后，方向正确 ✓
- 修复目标位置后，手臂方向正确，肘部弯曲方向也会自然

## What Changes

- 修改 `ClipBuilder.offsetToSceneLocalTarget` 函数：反转 Z 坐标（`-offset.z`），补偿 `vrm.scene.rotation.y = Math.PI`
- 在函数注释中说明坐标系转换逻辑
- 不修改 `LOCATION_OFFSETS` 数值（保持 Z 正值=前方的语义约定）
- 不修改 `getLocationOffset` 和 `applyMovementOffset`（它们在"前方=+Z"的语义坐标系下工作，转换由 `offsetToSceneLocalTarget` 统一处理）

## Impact

- Affected specs:
  - `fix-ik-bone-rest-direction`（rest direction 修复后动作仍不规范，本 spec 解决剩余的坐标系问题）
  - `fix-animation-mixer-normalized-bone`（骨骼能动的基础修复，不受影响）
- Affected code:
  - `frontend/src/modules/avatar/ClipBuilder.ts`（仅修改 `offsetToSceneLocalTarget` 函数）
  - 不影响 `IKSolver.ts`、`VRMAnimator.ts`、`VRMModel.tsx`、`AvatarDriver.ts`

## ADDED Requirements

### Requirement: IK 目标位置必须正确处理 scene 旋转

`ClipBuilder.offsetToSceneLocalTarget` 必须补偿 `vrm.scene.rotation.y = Math.PI` 导致的坐标系差异，把"前方=+Z"语义的偏移量转换到 scene 本地坐标系（"前方=-Z"）。

#### Scenario: 目标位置在模型前方

- **WHEN** ClipBuilder 计算 IK 目标位置（如 CHEST_CENTER、FACE_LEVEL）
- **THEN** `offsetToSceneLocalTarget` 反转 Z 坐标（`-offset.z`）
- **AND** 目标位置在 scene 本地坐标系的 -Z 方向（模型前方）
- **AND** 手臂向前伸出，不是向后

#### Scenario: X 坐标方向不变

- **WHEN** ClipBuilder 计算 IK 目标位置（如 CHEST_RIGHT、CHEST_LEFT）
- **THEN** X 坐标不反转（`offset.x * xScale`）
- **AND** 右侧位置在 +X 方向（scene 本地坐标系下右臂方向），左侧在 -X 方向

#### Scenario: Y 坐标不受影响

- **WHEN** ClipBuilder 计算 IK 目标位置
- **THEN** Y 坐标使用 `scaleOffsetY` 缩放，不反转
- **AND** 向上位置在 +Y 方向（Y 轴不受 scene.rotation.y 影响）

### Requirement: 坐标系转换逻辑必须文档化

`offsetToSceneLocalTarget` 函数注释必须说明：
1. `LOCATION_OFFSETS` 的 Z 值语义（正值=前方，与世界坐标系一致）
2. scene 本地坐标系下"前方"是 -Z（因 `vrm.scene.rotation.y = π`）
3. Z 坐标取反的原因

#### Scenario: 函数注释完整

- **WHEN** 开发者阅读 `offsetToSceneLocalTarget` 函数
- **THEN** 注释说明 Z 坐标取反的原因
- **AND** 注释提及 `vrm.scene.rotation.y = Math.PI` 的影响
- **AND** 后续维护者能理解为什么只反转 Z 不反转 X

## MODIFIED Requirements

### Requirement: offsetToSceneLocalTarget 函数

修改 `offsetToSceneLocalTarget`（位于 `frontend/src/modules/avatar/ClipBuilder.ts`），在构造 `scaled` 向量时反转 Z 坐标。

修改前：
```typescript
const scaled = new THREE.Vector3(
  offset.x * xScale,
  scaleOffsetY(offset.y, scale),
  offset.z,
);
```

修改后：
```typescript
// Z 取反：LOCATION_OFFSETS 的 Z 正值表示"前方"（与世界坐标系一致），
// 但 scene 本地坐标系下模型面朝 -Z（因 vrm.scene.rotation.y = π），"前方"是 -Z。
// X 不取反：scene 本地坐标系下右臂在 +X 方向（T-pose），与 LOCATION_OFFSETS 的 X 正值=右侧 一致。
const scaled = new THREE.Vector3(
  offset.x * xScale,
  scaleOffsetY(offset.y, scale),
  -offset.z,
);
```
