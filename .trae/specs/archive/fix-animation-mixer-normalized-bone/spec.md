# 修复 AnimationMixer 使用 Normalized Bone 驱动 VRM Spec

## Why

重写 avatar 模块改用 `THREE.AnimationMixer` 驱动 VRM 后，模型"身体完全不动"——只有表情（笑）生效，手臂/手指骨骼完全没有动作。

根因调查确认：`ClipBuilder` 使用 `humanoid.getRawBoneNode()` 获取骨骼节点生成 `QuaternionKeyframeTrack`，`AnimationMixer` 通过 `PropertyBinding` 直接设置 `rawBone.quaternion`。但 `VRMModel.useFrame` 中 `vrm.update(delta)` 紧随 `vrmAnimator.update(delta)` 之后调用，而 `VRMHumanoid.autoUpdateHumanBones` 默认为 `true`，`VRM.update()` 会调用 `VRMHumanoidRig.update()`，把 normalized bone 的旋转（identity，因为没人修改它）同步到 raw bone——**覆盖了 AnimationMixer 设置的旋转**，导致模型完全不动。

同时存在第二个问题：raw bone 的 rest pose 不是 identity（VRM 1.0 模型可能有非标准朝向），IK 解算的"绝对"旋转直接设置到 raw bone 会导致骨骼变形（即使不被覆盖）。normalized bone 的 rest pose 是 identity，IK 解算的 quaternion 直接设置正确。

参考证据：
- [`VRMHumanoidLoaderPlugin` 源码第 130 行](https://github.com/pixiv/three-vrm/blob/master/packages/three-vrm-core/src/humanoid/VRMHumanoidLoaderPlugin.ts)：`gltf.scene.add(humanoid.normalizedHumanBonesRoot)` —— normalized bone **在 vrm.scene 树中**，AnimationMixer 可以通过 PropertyBinding 找到
- [`VRMHumanoidRig` 源码第 75 行](https://github.com/pixiv/three-vrm/blob/master/packages/three-vrm-core/src/humanoid/VRMHumanoidRig.ts)：`rigBoneNode.name = 'Normalized_' + boneNode.name` —— normalized bone 有合法 name，PropertyBinding 可解析
- [`VRMHumanoidRig.update()` 源码第 105-120 行](https://github.com/pixiv/three-vrm/blob/master/packages/three-vrm-core/src/humanoid/VRMHumanoidRig.ts)：`boneNode.quaternion.copy(rigBoneNode.quaternion).multiply(...)` —— 从 normalized bone 同步到 raw bone
- 项目内 `VRMAdapter.ts`（实时姿态驱动）已正确使用 `getNormalizedBoneNode()`，可作为参考

## What Changes

- 把 `ClipBuilder.ts` 中所有 `humanoid.getRawBoneNode(boneName)` 调用替换为 `humanoid.getNormalizedBoneNode(boneName)`
  - `getModelScale`（第 123-126 行）：hips / leftShoulder / rightShoulder / head
  - `buildArmTracks`（第 242-244 行）：upperArm / lowerArm / hand
  - `buildRestArmTracks`（第 312-313 行）：upperArm / lowerArm
  - `buildFingerTracks`（第 354 行）：每个手指骨
  - `buildClip`（第 444 行）：hips
- `buildTrackName` 函数不需要改：`node.name` 对于 normalized bone 是 `'Normalized_J_Bip_R_UpperArm'` 之类的合法字符串，PropertyBinding.findNode 能在 scene 树中找到
- `getBoneWorldPos` 不需要改：normalized bone 的世界位置与 raw bone 一致（VRMHumanoidRig 重建时用了 raw bone 的世界位置）
- `getBoneLength` 不需要改：normalized bone 的 `position.length()` 等于骨骼长度（与世界位置差一致）
- IK 解算逻辑不需要改：normalized bone 的 rest pose 是 identity，IK 解算的"相对 rest pose"旋转直接设置正确

## Impact

- Affected specs: `rewrite-avatar-with-animation-mixer`（重写后的 AnimationMixer 方案因此修复才能工作）
- Affected code:
  - `frontend/src/modules/avatar/ClipBuilder.ts`（主要修改文件，5 处 `getRawBoneNode` 调用）
  - 不影响其他文件：`VRMAnimator.ts`、`VRMModel.tsx`、`AvatarDriver.ts` 的逻辑都正确

## ADDED Requirements

### Requirement: AnimationMixer 必须操作 Normalized Bone

ClipBuilder 生成 `QuaternionKeyframeTrack` 时，必须使用 `humanoid.getNormalizedBoneNode(boneName)` 获取骨骼节点，**禁止**使用 `getRawBoneNode()`。

#### Scenario: AnimationMixer 设置的旋转不被覆盖

- **WHEN** AvatarDriver 调用 `vrmAnimator.playClip(clip)` 播放包含手臂轨道的 clip
- **AND** `VRMModel.useFrame` 按顺序调用 `vrmAnimator.update(delta)` 然后 `vrm.update(delta)`
- **THEN** `vrm.update()` 内部的 `autoUpdateHumanBones` 机制把 normalized bone 的旋转同步到 raw bone
- **AND** 模型骨骼按照 IK 解算的结果正确旋转

#### Scenario: 输入"你好"后模型手臂移动

- **WHEN** 用户在文字转手语页面输入"你好"并发送
- **THEN** VRM 模型右手臂从胸部位置（CHEST_CENTER）移动到面部位置（FACE_LEVEL）
- **AND** 同时显示"笑"表情
- **AND** 动作过渡平滑，无明显跳变

### Requirement: 轨道名生成保持现有逻辑

`buildTrackName(node)` 继续使用 `(node.name || node.uuid) + '.quaternion'` 格式。对于 normalized bone，`node.name` 是 `'Normalized_' + 原始骨骼名`（如 `'Normalized_J_Bip_R_UpperArm'`），PropertyBinding.findNode 能在 `vrm.scene` 树中找到匹配节点。

#### Scenario: PropertyBinding 成功解析轨道名

- **WHEN** `VRMAnimator.playClip` 调用 `mixer.clipAction(clip)` 创建 AnimationAction
- **THEN** AnimationMixer 内部通过 `PropertyBinding.parseTrackName` 解析轨道名
- **AND** `PropertyBinding.findNode(vrm.scene, 'Normalized_J_Bip_R_UpperArm')` 在 scene 树中递归查找
- **AND** 找到 normalized bone 节点并绑定 `quaternion` 属性
- **AND** 不在控制台输出 "Track not found" 警告
