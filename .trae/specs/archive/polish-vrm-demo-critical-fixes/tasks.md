# SignBridge VRM Demo 关键攻坚 - Implementation Plan

## [/] Task 1: 修复VRM初始T-pose — 加载后设置自然中性姿态
- **Priority**: high
- **Depends On**: None
- **Description**:
  - 在 `VRMModel.tsx` 中，VRM 加载成功后立即设置自然中性姿态（消除 T-pose 双臂平举）
  - 中性姿态：双臂自然下垂，肘部微屈。VRM humanoid bone 旋转：
    - `LeftUpperArm` / `RightUpperArm`: 绕局部 X 轴 -0.15rad（前倾下垂）+ 绕 Z 轴 ±0.05rad（贴向身体）
    - `LeftLowerArm` / `RightLowerArm`: 绕局部 X 轴 0.20rad（肘部微屈）
  - 使用 `vrm.humanoid.getNormalizedBoneNode(VRMHumanBoneName.Xxx)?.quaternion.setFromEuler(euler)`
  - 设置后调用 `vrm.updateMatrixWorld(true)` 让变换生效
  - 关键：让 AnimationMixer 知道"静止姿态"是什么，以便 stop() 时回到这里
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `human-judgement` TR-1.1: 页面加载后，虚拟人双臂自然下垂于身体两侧，不平举
  - `programmatic` TR-1.2: TypeScript 类型检查通过
- **Notes**: 旋转值需要微调——从保守值开始，根据浏览器截图调整。

## [ ] Task 2: 修复动画结束回归T-pose问题
- **Priority**: high
- **Depends On**: Task 1
- **Description**:
  - 问题：当前 `vrmAnimator.stop(0.3)` 让 action fade out 到绑定姿态（T-pose），而非 Task 1 设置的中性姿态
  - 方案：修改 `VRMAnimator` 类，新增方法 `playIdlePose(duration)` 或 `fadeToPose(targetPose, duration)`
  - 在 `AvatarDriver.playSequence` 的 VRM 轨道播放完毕后（所有 clip await 完成后），调用新方法 fadeToPose 到中性姿态（0.3秒），而不是 stop()
  - 或者更简洁：在 `VRMAnimator` 中实现"idle clip"概念——创建一个持有中性姿态关键帧的 clip，无其他 action 时播放它
- **Acceptance Criteria Addressed**: AC-3, AC-4
- **Test Requirements**:
  - `human-judgement` TR-2.1: "你好"动画播放完成后，手臂在 0.3-0.5 秒内平滑回到身体两侧，无 T-pose 闪现
  - `programmatic` TR-2.2: TypeScript 类型检查通过，npm test 通过
- **Notes**: 推荐最简方案——`VRMAnimator.playIdleClip(vrm, fadeInDuration)` 内部用 ClipBuilder.buildIdleClip(vrm) 生成单帧中性姿态 clip，调用 mixer.play(this.idleAction)。stop 时改为 fadeTo 同一 idle action。

## [ ] Task 3: 端到端验证 — 浏览器实测核心手语词动画效果
- **Priority**: high
- **Depends On**: Task 1, Task 2
- **Description**:
  - 启动 dev server，浏览器中实测：
    1. 页面加载后虚拟人呈自然站立姿态（无 T-pose）
    2. 输入"你好"播放：挥手动作可见、手形基本正确、结束后平滑归位
    3. 输入"谢谢""再见"播放：动作可见且可辨识
    4. 多词连续播放（如"你好谢谢再见"）词间过渡自然，无 T-pose 闪现
  - 截图前后对比，记录结果
- **Acceptance Criteria Addressed**: AC-1, AC-4, AC-5
- **Test Requirements**:
  - `human-judgement` TR-3.1: 初始姿态自然，无 T-pose
  - `human-judgement` TR-3.2: 核心手语词动画质量可接受
  - `human-judgement` TR-3.3: 多词连续播放流畅，词间无 T-pose
  - `programmatic` TR-3.4: npm run build 成功
- **Notes**: 如发现穿模或手形错误，可微调 ClipBuilder 中 LOCATION 偏移或手指角度。

## [ ] Task 4: 更新CHANGELOG
- **Priority**: medium
- **Depends On**: Task 1, Task 2, Task 3
- **Description**:
  - 在 CHANGELOG.md 的 [Unreleased] 区域添加本次修复的变更记录
  - 分类：fix（VRM 初始姿态、动画结束回归）
- **Acceptance Criteria Addressed**: 项目约定
- **Test Requirements**:
  - `programmatic` TR-4.1: CHANGELOG.md 格式正确，记录完整
