# 骨骼动作正确表示手语动作 - 实施计划

## [x] Task 1: ClipBuilder 生成头部动作轨道
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 在 ClipBuilder.buildClip() 中新增 buildHeadMovementTrack 函数
  - 根据 head_movement 枚举值生成 neck/head 骨骼的 QuaternionKeyframeTrack
  - 支持 nod/shake/tilt/tilt_left/tilt_right/slight_nod/slight_bow 动作
- **Acceptance Criteria Addressed**: AC-1
- **Test Requirements**:
  - `programmatic` TR-1.1: buildClip 生成的 clip 包含 neck 或 head 轨道（当 head_movement != none 时）
  - `programmatic` TR-1.2: 现有单元测试全部通过

## [x] Task 2: HandShape 增加手指外展角度
- **Priority**: high
- **Depends On**: None
- **Description**: 
  - 扩展 FingerPose 类型增加 y/z 旋转分量
  - 更新 HAND_SHAPE_DEFINITIONS 中需要外展的手形（OPEN_5/V_SHAPE/HORNS 等）
  - 更新 handShapeToBoneRotations 和 buildFingerTracks 应用三轴旋转
- **Acceptance Criteria Addressed**: AC-2
- **Test Requirements**:
  - `programmatic` TR-2.1: OPEN_5 手形的手指 Y/Z 旋转分量非零
  - `programmatic` TR-2.2: 现有单元测试全部通过

## [x] Task 3: FABRIK 使用实际 rest direction
- **Priority**: medium
- **Depends On**: None
- **Description**: 
  - 修改 solveFABRIK 接受可选的 upperRestDir/lowerRestDir 参数
  - ClipBuilder.solveArmQuaternions 中的 FABRIK 分支传入实际 rest direction
  - 保持向后兼容（不传时使用默认值）
- **Acceptance Criteria Addressed**: AC-3
- **Test Requirements**:
  - `programmatic` TR-3.1: solveFABRIK 使用传入的 rest direction
  - `programmatic` TR-3.2: 现有单元测试全部通过

## [x] Task 4: 综合验证
- **Priority**: high
- **Depends On**: Task 1, Task 2, Task 3
- **Description**: 
  - 运行全部单元测试
  - 构建验证无编译错误
  - 检查生成的 clip 结构正确
- **Acceptance Criteria Addressed**: AC-4
- **Test Requirements**:
  - `programmatic` TR-4.1: npx vitest run 全部通过
  - `programmatic` TR-4.2: npx tsc -b 无类型错误
  - `programmatic` TR-4.3: npx vite build 构建成功