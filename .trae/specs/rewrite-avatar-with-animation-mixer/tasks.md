# Tasks

- [x] Task 1: 创建 VRMAnimator 类（封装 AnimationMixer）
  - [x] SubTask 1.1: 新建文件 `frontend/src/modules/avatar/VRMAnimator.ts`
  - [x] SubTask 1.2: 实现 `VRMAnimator` 类：构造函数接收 `VRM` 实例，内部创建 `THREE.AnimationMixer(vrm.scene)`
  - [x] SubTask 1.3: 实现 `playClip(clip: THREE.AnimationClip, fadeIn: number)`：停止当前 action，创建新 clipAction，设置 `setEffectiveWeight(1)`，`fadeIn` 秒淡入
  - [x] SubTask 1.4: 实现 `stop(fadeOut: number)`：当前 action 淡出
  - [x] SubTask 1.5: 实现 `update(delta: number)`：调用 `mixer.update(delta)`
  - [x] SubTask 1.6: 添加日志（使用 logger 模块）

- [x] Task 2: 创建 ClipBuilder 类（从 SignGloss 生成 AnimationClip）
  - [x] SubTask 2.1: 新建文件 `frontend/src/modules/avatar/ClipBuilder.ts`
  - [x] SubTask 2.2: 实现 `buildClip(gloss: SignGloss, vrm: VRM): THREE.AnimationClip` 主方法
  - [x] SubTask 2.3: 实现位置映射：`HandLocation` → VRM scene 本地坐标（基于 hips 偏移，参考现有 `LOCATION_POSITIONS`）
  - [x] SubTask 2.4: 实现 IK 调用：读取肩部骨骼本地位置、计算手腕目标本地位置、调用 `IKSolver.solve()` 获取肩肘旋转
  - [x] SubTask 2.5: 实现关键帧生成：在 0%~100% 间取 5 个采样点，对每个点用 lerp 插值起止位置后调用 IK，生成 `QuaternionKeyframeTrack`
  - [x] SubTask 2.6: 实现手指轨道：从 `HandShape` 查表获取 15 个手指骨角度，生成 `QuaternionKeyframeTrack`
  - [x] SubTask 2.7: 实现表情轨道：`FacialExpression` → `NumberKeyframeTrack('expressionManager.<preset>', ...)`
  - [x] SubTask 2.8: 轨道名格式：使用 VRM rawBoneNode 的 `.quaternion` 属性（如 `rightUpperArm.quaternion`）

- [x] Task 3: 重写 AvatarDriver（移除 VRMPose 轨道，改用 AnimationClip）
  - [x] SubTask 3.1: 移除 `vrmQueue`、`vrmIndex`、`vrmTime`、`vrmPlaying`、`vrmFinished` 字段
  - [x] SubTask 3.2: 新增 `vrmAnimator: VRMAnimator | null` 字段，在 `setVRMAnimator` 方法中设置
  - [x] SubTask 3.3: 重写 `playSequence`：对每个词汇调用 `ClipBuilder.buildClip()`，依次 `vrmAnimator.playClip(clip, 0.3)`
  - [x] SubTask 3.4: 重写 `update`：只调用 `vrmAnimator.update(delta)`（不再推进 vrmTime）
  - [x] SubTask 3.5: 重写 `getCurrentVRMPose`：返回 NEUTRAL_VRM_POSE（兼容性保留，不再实际使用）
  - [x] SubTask 3.6: 移除 `prepareVRMMotion` 方法（被 ClipBuilder 替代）
  - [x] SubTask 3.7: 移除 `VRM_LOCATION_OFFSETS`、`getHandTarget`、`buildKeyframePose`、`generateMotion` 等辅助函数

- [x] Task 4: 简化 VRMModel 组件（移除手动骨骼操作）
  - [x] SubTask 4.1: 移除 `applyVRMPose` 函数（第 277-572 行）
  - [x] SubTask 4.2: 移除 `applyLimbIK` 内部函数
  - [x] SubTask 4.3: 移除 `computeTargetWorld`、`toSceneLocal` 辅助函数
  - [x] SubTask 4.4: 移除 `INJECT_TEST_ROTATION` 常量及测试代码
  - [x] SubTask 4.5: 移除 `BoneSmoother` 实例化（`smootherRef`）
  - [x] SubTask 4.6: 移除 `getRestWorldDir`、`getModelScale`、`scaleOffsetY` 等辅助函数（ClipBuilder 内部自行处理）
  - [x] SubTask 4.7: 移除 `REST_WORLD_DIR`、`MODEL_SCALE`、`ORIGINAL_HIPS_POS` 等 WeakMap 缓存
  - [x] SubTask 4.8: 新增 `vrmAnimatorRef`，在 VRM 加载完成后创建 `VRMAnimator` 实例
  - [x] SubTask 4.9: 简化 `useFrame`：只调用 `vrmAnimator.update(delta)` + `vrm.update(delta)`
  - [x] SubTask 4.10: 移除 IK 调试可视化代码（showIKDebug 相关）

- [x] Task 5: 清理废弃文件和类型
  - [x] SubTask 5.1: 删除 `frontend/src/modules/avatar/Retargeter.ts`
  - [x] SubTask 5.2: 删除 `frontend/src/modules/avatar/Smoother.ts`（保留：仍被 KalidokitSolver.ts 使用 QuaternionSmoother、Avatar3D.tsx 使用 BoneSmoother，二者均不在本次重写范围）
  - [x] SubTask 5.3: 删除 `frontend/src/modules/avatar/VRMPoseAdapter.ts`
  - [x] SubTask 5.4: 删除 `frontend/src/modules/avatar/VRMAdapter.ts`（保留：RealtimePoseDriver 依赖它，且 RealtimePoseDriver 仍在使用）
  - [x] SubTask 5.5: 移除 `types/avatar.ts` 中 `VRMPose.ikTargets` 字段
  - [x] SubTask 5.6: 更新所有引用了被删除模块的 import 语句

- [x] Task 6: 验证修复效果
  - [x] SubTask 6.1: VS Code 诊断无 error/warning（GetDiagnostics 返回空数组；单元测试 260/262 通过，2 个失败与 avatar 无关）
  - [ ] SubTask 6.2: 启动 dev server，输入"你好"，确认模型手臂从 chest 移动到 face_level（需用户手动验证）
  - [ ] SubTask 6.3: 确认表情（happy）同时生效（需用户手动验证）
  - [ ] SubTask 6.4: 确认词汇间过渡平滑（无骨骼跳变）（需用户手动验证）
  - [ ] SubTask 6.5: 确认性能稳定（帧率 ≥ 50fps）（需用户手动验证）

# Task Dependencies
- Task 1 独立（VRMAnimator 无外部依赖）
- Task 2 依赖 Task 1（ClipBuilder 生成的 clip 由 VRMAnimator 播放，但代码上可独立编写）
- Task 3 依赖 Task 1、Task 2（AvatarDriver 使用 VRMAnimator 和 ClipBuilder）
- Task 4 依赖 Task 1、Task 3（VRMModel 使用 VRMAnimator，AvatarDriver 简化后接口变化）
- Task 5 依赖 Task 4（确认无引用后再删除）
- Task 6 依赖 Task 1-5
