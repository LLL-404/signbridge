# 手语动作穿模根因修复 Spec

## Why

`fix-sign-clipping` 通过增大 `LOCATION_OFFSETS` 的 Z 值和 `solveArmQuaternions` 中 `reference` 向量的 Z 分量尝试修复穿模，但用户反馈问题未解决。说明根因不在数值大小，而在方向或坐标系逻辑。

深度代码审查 + three-vrm 源码分析定位到**真正的根因链**：

### 根因 1（首要）：铰链轴在 A-pose 退化

[VRMHumanoidRig._setupTransforms](file:///d:/G/github/signbridge/frontend/node_modules/@pixiv/three-vrm-core/lib/three-vrm-core.module.js#L1820-L1827) 中 normalized bone 的 `position` 构造方式：

```javascript
rigBoneNode.position.copy(boneWorldPosition);
if (parentBoneWorldPosition) {
  rigBoneNode.position.sub(parentBoneWorldPosition);  // 子骨骼世界位置 - 父骨骼世界位置
}
```

normalized bone 的 `position` 反映模型**实际 rest pose 几何方向**（raw bone 世界坐标差值），不是 VRM 规范的标准 T-pose。

[ClipBuilder.ts:355](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts#L355) 用 `lowerNode.position.clone().normalize()` 获取 `upperRestDir`，在 A-pose 模型（手臂下垂）下 `upperRestDir ≈ (0, -1, 0)`。

[ClipBuilder.ts:311](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts#L311) 计算 `hingeAxis = computeHingeAxis(upperRestDir, UP)` = `upperRestDir × (0,1,0)`。当 `upperRestDir = (0,-1,0)` 与 UP 平行时，**叉积为零向量**，`hingeAxis = (0,0,0)`。

[JointLimits.ts:79-101](file:///d:/G/github/signbridge/frontend/src/modules/avatar/JointLimits.ts#L79) `constrainHingeJoint` 中 `rotAxis.dot(hingeAxis) = 0`，`signedAngle = 0`，返回 `setFromAxisAngle((0,0,0), 0) = identity`。肘部被强制为 identity（伸直），前臂保持与上臂同方向，穿入躯干。

### 根因 2（次要）：reference 向量方向假设可能与 upperRestDir 不匹配

[ClipBuilder.ts:278-279](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts#L278) `reference = (sideBias, -1.0, 0.6)`，`sideBias` 对右臂为 -0.6，假设右臂在 -X 侧（T-pose 水平外伸）。但如果模型是 A-pose，`upperRestDir = (0,-1,0)`，`sideBias` 的 X 分量与 `upperRestDir` 方向不匹配，`elbowDir` 投影方向错误，肘部位置错误。

### 根因 3（待验证）：upperRestDir 实际值未经验证

历史 spec `fix-ik-bone-rest-direction` 假设 `rightLowerArm.position ≈ (+0.26, 0, 0)`（标准 T-pose +X），但该假设基于旧模型（`vrm.scene.rotation.y = π` 时世界坐标 X 被反转）。移除旋转后，模型右臂在 -X 侧，`upperRestDir` 实际值可能是 `(-1, 0, 0)`（T-pose）或 `(0, -1, 0)`（A-pose），从未通过运行时日志验证。

## What Changes

- **诊断阶段**：在 `solveArmQuaternions` 和 `buildArmTracks` 中添加一次性诊断日志，打印 `upperRestDir`、`lowerRestDir`、`hingeAxis`、`elbowDir`、`upperArmDir`、`forearmLocalDir`、`signedAngle` 等关键中间值，确认模型实际 rest pose 和退化点
- **修复阶段**（根据诊断结果选择）：
  - **若 hingeAxis 退化**：在 `computeHingeAxis` 中检测零向量，回退到模型几何感知的铰链轴（基于 `upperRestDir` 与正交参考方向构造，而非硬编码 UP）
  - **若 reference 方向不匹配**：让 `sideBias` 从 `upperRestDir` 动态推导（如 `sideBias = upperRestDir.x` 的符号），而非硬编码 `side === 'left' ? 0.6 : -0.6`
  - **若 upperRestDir 方向整体错误**：修正 `upperRestDir` 获取逻辑
- **不修改** `LOCATION_OFFSETS` 数值（fix-sign-clipping 的数值调整保留，不是根因）

## Impact

- Affected specs:
  - `fix-sign-clipping`（数值调整未解决根因，本 spec 处理方向逻辑）
  - `fix-ik-bone-rest-direction`（rest direction 获取逻辑正确，但后续铰链轴计算未考虑退化）
  - `refactor-joint-limits-utils`（`JointLimits.ts` 的 `computeHingeAxis` 需增加退化处理）
- Affected code:
  - [ClipBuilder.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts) — `solveArmQuaternions` 添加诊断日志、`reference` 向量动态化
  - [JointLimits.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/JointLimits.ts) — `computeHingeAxis` 增加退化检测和回退
  - 不影响 `VRMAnimator.ts`、`VRMModel.tsx`、`AvatarDriver.ts`

## ADDED Requirements

### Requirement: 铰链轴计算必须处理 rest direction 与参考方向平行的退化情况

`computeHingeAxis` 在 `boneRestDir` 与 `referenceDir` 平行（叉积为零）时，必须回退到几何感知的铰链轴，不能返回零向量。

#### Scenario: A-pose 模型铰链轴不退化

- **WHEN** 模型 rest pose 为 A-pose（手臂下垂），`upperRestDir ≈ (0, -1, 0)`，与 `UP = (0, 1, 0)` 平行
- **THEN** `computeHingeAxis` 检测到叉积长度小于阈值（如 1e-6）
- **AND** 回退到正交参考方向（如 `(1, 0, 0)` 或 `(0, 0, 1)`）构造铰链轴
- **AND** 返回非零归一化铰链轴
- **AND** `constrainHingeJoint` 能正确计算弯曲角度

#### Scenario: T-pose 模型铰链轴正常

- **WHEN** 模型 rest pose 为 T-pose（手臂水平外伸），`upperRestDir ≈ (±1, 0, 0)`，与 `UP` 正交
- **THEN** `computeHingeAxis` 正常计算叉积
- **AND** 返回 `upperRestDir × UP` 的归一化结果
- **AND** 行为与现有实现一致

### Requirement: 肘部引导方向必须与 upperRestDir 方向一致

`solveArmQuaternions` 中 `reference` 向量的 `sideBias` 必须从 `upperRestDir` 动态推导，不能硬编码基于 `side` 参数。

#### Scenario: 右臂 reference 方向正确

- **WHEN** 右臂 `upperRestDir = (-1, 0, 0)`（T-pose 右臂在 -X 侧）
- **THEN** `sideBias` 从 `upperRestDir.x` 推导为负值
- **AND** `reference = (sideBias, -1.0, 0.6)` 让肘部向 -X 侧偏（向外）
- **AND** 肘部位置在身体外侧，不穿入躯干

#### Scenario: A-pose 右臂 reference 方向适配

- **WHEN** 右臂 `upperRestDir = (0, -1, 0)`（A-pose 手臂下垂）
- **THEN** `sideBias` 推导逻辑不依赖 X 方向
- **AND** `reference` 向量在垂直于 `upperRestDir` 的平面内有合理的肘部引导方向
- **AND** 肘部向前方伸出，不穿入躯干

### Requirement: IK 解算必须支持运行时诊断

`solveArmQuaternions` 必须支持打印关键中间值日志，便于验证根因和调试。

#### Scenario: 诊断日志输出

- **WHEN** `solveArmQuaternions` 被调用且诊断开关开启
- **THEN** 日志输出 `upperRestDir`、`lowerRestDir`、`hingeAxis`、`shoulderSceneLocal`、`wristTarget`、`upperArmDir`、`elbowPos`、`forearmLocalDir`、`signedAngle`
- **AND** 日志使用 `log.debug` 级别，可通过 logger 配置控制开关
- **AND** 不影响正常性能（诊断关闭时无开销）

## MODIFIED Requirements

### Requirement: computeHingeAxis 函数

修改 [JointLimits.ts:58-63](file:///d:/G/github/signbridge/frontend/src/modules/avatar/JointLimits.ts#L58) `computeHingeAxis`，增加退化检测和回退逻辑。

修改前：

```typescript
export function computeHingeAxis(
  boneRestDir: THREE.Vector3,
  referenceDir: THREE.Vector3,
): THREE.Vector3 {
  return new THREE.Vector3().crossVectors(boneRestDir, referenceDir).normalize();
}
```

修改后（示意）：

```typescript
export function computeHingeAxis(
  boneRestDir: THREE.Vector3,
  referenceDir: THREE.Vector3,
): THREE.Vector3 {
  const axis = new THREE.Vector3().crossVectors(boneRestDir, referenceDir);
  // 检测退化：boneRestDir 与 referenceDir 平行时叉积为零
  if (axis.lengthSq() < 1e-6) {
    // 回退：选择与 boneRestDir 正交的参考方向
    // 优先用 (1,0,0)，若 boneRestDir 接近 (1,0,0) 则用 (0,0,1)
    const fallback = Math.abs(boneRestDir.x) < 0.9
      ? new THREE.Vector3(1, 0, 0)
      : new THREE.Vector3(0, 0, 1);
    axis.crossVectors(boneRestDir, fallback);
  }
  return axis.normalize();
}
```

### Requirement: solveArmQuaternions 中 reference 向量动态化

修改 [ClipBuilder.ts:278-279](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts#L278) `reference` 向量构造，`sideBias` 从 `upperRestDir` 推导。

修改前：

```typescript
const sideBias = side === 'left' ? 0.6 : -0.6;
const reference = new THREE.Vector3(sideBias, -1.0, 0.6).normalize();
```

修改后（示意，根据诊断结果调整）：

```typescript
// sideBias 从 upperRestDir 推导，适配 T-pose 和 A-pose
// T-pose: upperRestDir.x 的符号决定肘部偏向外侧
// A-pose: upperRestDir ≈ (0,-1,0)，sideBias 退化为 0，依赖 Y/Z 分量引导
const sideBias = upperRestDir.x * 0.6;
const reference = new THREE.Vector3(sideBias, -1.0, 0.6).normalize();
```

## REMOVED Requirements

无（保留 `fix-sign-clipping` 的数值调整，不回滚）。
