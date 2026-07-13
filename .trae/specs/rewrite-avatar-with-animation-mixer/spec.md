# 重写 Avatar 模块（基于 AnimationMixer）Spec

## Why
用户多次反馈"输入'你好'后模型只笑不动"——表情能生效但手臂完全不动。历经两轮 spec 修复（`fix-vrm-arm-movement`、`fix-vrm-ik-quaternion-transform`）后问题依旧。根因是现有架构用"每帧手动设置 `node.quaternion`"驱动骨骼，涉及 500+ 行四元数/坐标变换代码、6 个文件、3 处 WeakMap 缓存，任一环节出错都会导致骨骼不动且极难调试。

**决定推倒重写**：改用 three.js 原生 `AnimationMixer` + `KeyframeTrack` 驱动 VRM，让 three.js 内部处理插值和应用，彻底消除手动四元数变换。

## What Changes

### 丢弃（删除或废弃）
- **删除** `applyVRMPose` 函数（VRMModel.tsx 第 277-572 行）——手动骨骼操作的核心
- **删除** `applyLimbIK` 函数——复杂的四元数变换链
- **删除** `Retargeter.ts`——T-pose/A-pose 差异校正（AnimationMixer 不需要）
- **删除** `BoneSmoother`（Smoother.ts）——AnimationMixer 内置插值平滑
- **删除** `VRMPoseAdapter.ts`、`VRMAdapter.ts`——手动 pose 应用层
- **删除** `MotionPlayer.ts` 中 BonePose 相关轨道（保留 VRM 关键帧轨道）
- **删除** `NEUTRAL_VRM_POSE`、`VRMPose` 类型中的 `ikTargets` 字段——不再需要 IK 目标位置
- **删除** `RealtimePoseDriver.ts`、`KalidokitSolver.ts`——实时姿态追踪路径（本次不涉及，保留文件但不在重写范围内）

### 保留
- **`IKSolver.ts`**——解析 IK 算法（O(1) 性能、无抖动），用于计算目标骨骼旋转
- **`HandShape.ts`**——手形定义和手指角度映射
- **`vocabulary.json`**——词汇表数据（手形、位置、运动方向）
- **`MotionPlayer.ts`**——时序控制（播放、暂停、进度）
- **VRM 加载逻辑**——`VRMLoaderPlugin` + `vrm.scene.rotation.y = Math.PI`

### 新增
- **`VRMAnimator`** 类（新文件 `modules/avatar/VRMAnimator.ts`）：封装 `AnimationMixer`，提供 `playClip(clip, fadeIn)`、`stop(fadeOut)` 接口
- **`ClipBuilder`** 类（新文件 `modules/avatar/ClipBuilder.ts`）：从 `SignGloss` 生成 `THREE.AnimationClip`，内部调用 `IKSolver` 计算骨骼旋转，生成 `QuaternionKeyframeTrack`
- **`AvatarDriver` 重写**：不再维护 `VRMPose`，改为生成 `AnimationClip` 交给 `VRMAnimator` 播放

### 核心架构改变
```
旧架构（复杂、易错）：
AvatarDriver → VRMPose → applyVRMPose → 手动设置 node.quaternion
                                  ↓
                          applyLimbIK（四元数变换）
                                  ↓
                          BoneSmoother（平滑）
                                  ↓
                          Retargeter（T-pose 校正）

新架构（简洁、可靠）：
AvatarDriver → ClipBuilder → AnimationClip → VRMAnimator(AnimationMixer)
                                          ↓
                                  three.js 自动应用
                                          ↓
                                  vrm.update(delta)
```

## Impact

### 受影响的代码
- `frontend/src/components/avatar/VRMModel.tsx`——大幅简化，useFrame 只调用 `vrmAnimator.update(delta)` + `vrm.update(delta)`
- `frontend/src/modules/avatar/AvatarDriver.ts`——重写，移除 VRMPose 轨道，改为生成 AnimationClip
- `frontend/src/modules/avatar/MotionPlayer.ts`——简化，移除 BonePose 相关代码
- `frontend/src/types/avatar.ts`——移除 VRMPose.ikTargets，保留 VRMPose.bones（用于显式骨骼旋转）

### 受影响的 specs
- `fix-vrm-arm-movement`——废弃（被本 spec 取代）
- `fix-vrm-ik-quaternion-transform`——废弃（被本 spec 取代）
- `fix-sign-animation-pipeline`——保留（词汇查找和文本解析逻辑不变）

### 依赖
- 需要安装 `@pixiv/three-vrm-animation`（已包含在 `@pixiv/three-vrm@^3.5.4` 中）
- three.js `AnimationMixer`、`AnimationClip`、`QuaternionKeyframeTrack`、`NumberKeyframeTrack`（three.js 内置）

## ADDED Requirements

### Requirement: VRMAnimator 动画驱动
系统 SHALL 提供 `VRMAnimator` 类，封装 `THREE.AnimationMixer`，负责播放 `AnimationClip` 到 VRM 模型。

#### Scenario: 播放手语动作
- **WHEN** AvatarDriver 调用 `vrmAnimator.playClip(clip, 0.3)`
- **THEN** AnimationMixer 创建 clipAction 并以 0.3 秒淡入播放
- **AND** 每帧 `vrmAnimator.update(delta)` 推进动画
- **AND** `vrm.update(delta)` 在 mixer.update 之后调用（保证 spring bone/lookAt/expression 同步）

#### Scenario: 停止动画
- **WHEN** AvatarDriver 调用 `vrmAnimator.stop(0.3)`
- **THEN** 当前 action 以 0.3 秒淡出
- **AND** 淡出完成后骨骼回到 rest pose

### Requirement: ClipBuilder 从词汇生成动画
系统 SHALL 提供 `ClipBuilder` 类，从 `SignGloss` 生成 `THREE.AnimationClip`。

#### Scenario: 生成"你好"动作 clip
- **WHEN** ClipBuilder 收到 `gloss_001`（你好：chest_center → face_level, upward, open_5）
- **THEN** 生成包含以下轨道的 AnimationClip：
  - `rightUpperArm.quaternion`（肩部旋转关键帧）
  - `rightLowerArm.quaternion`（肘部旋转关键帧）
  - `leftUpperArm.quaternion`（左臂保持 rest）
  - `leftLowerArm.quaternion`（左臂保持 rest）
  - 右手 15 个手指骨的 `.quaternion`（open_5 手形）
  - `expressionManager.happy`（表情轨道）
- **AND** 肩肘旋转通过 `IKSolver.solve()` 计算（输入：肩部世界位置、手腕目标世界位置）
- **AND** 关键帧间用 5 个采样点（0%, 25%, 50%, 75%, 100%）保证曲线平滑

#### Scenario: IK 计算坐标系
- **WHEN** ClipBuilder 调用 IKSolver
- **THEN** 肩部位置和手腕目标位置都在 VRM scene 本地坐标系（非世界坐标）
- **AND** 手腕目标位置 = `hipsLocalPosition + scaledOffset`（不做 sceneQuat 变换，因为轨道是相对 scene 的）

### Requirement: AvatarDriver 简化
AvatarDriver SHALL 移除 `VRMPose` 轨道，改为生成 `AnimationClip` 交给 `VRMAnimator` 播放。

#### Scenario: 播放词汇序列
- **WHEN** 调用 `playSequence(sequence)`
- **THEN** 对每个词汇调用 `ClipBuilder.buildClip(gloss)` 生成 AnimationClip
- **AND** 依次调用 `vrmAnimator.playClip(clip, fadeIn)` 播放
- **AND** 词汇间用 0.2 秒淡入/淡出过渡
- **AND** 不再维护 `vrmQueue`、`vrmTime`、`vrmPlaying`、`vrmFinished` 状态

## MODIFIED Requirements

### Requirement: VRMModel 组件简化
VRMModel 组件的 useFrame SHALL 只做两件事：
1. 调用 `vrmAnimator.update(delta)` 推进动画
2. 调用 `vrm.update(delta)` 更新 spring bone/lookAt/expression

移除原有的 `applyVRMPose` 调用、`BoneSmoother` 实例、`INJECT_TEST_ROTATION` 测试代码、IK 调试可视化等所有手动骨骼操作代码。

## REMOVED Requirements

### Requirement: 手动骨骼操作（applyVRMPose）
**Reason**: 手动四元数变换是"模型不动"问题的根因，改用 AnimationMixer 后不再需要
**Migration**: 所有原 applyVRMPose 的功能由 VRMAnimator + ClipBuilder 替代

### Requirement: BoneSmoother 平滑
**Reason**: AnimationMixer 内置插值（可配置 InterpolantColors、平滑模式），不需要额外平滑层
**Migration**: 删除 Smoother.ts，平滑由 AnimationMixer 的 `LinearInterpolant` 处理

### Requirement: Retargeter T-pose 校正
**Reason**: AnimationMixer 通过 KeyframeTrack 直接设置目标骨骼的 quaternion，不需要 rest pose 差异校正
**Migration**: 删除 Retargeter.ts，ClipBuilder 生成轨道时直接写入目标旋转

### Requirement: VRMPose.ikTargets
**Reason**: 不再需要"IK 目标位置"中间表示，ClipBuilder 内部直接调用 IKSolver 并生成骨骼旋转轨道
**Migration**: 移除 VRMPose.ikTargets 字段，IK 计算在 ClipBuilder 内部完成
