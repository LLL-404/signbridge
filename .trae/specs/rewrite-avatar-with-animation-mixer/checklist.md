# Checklist

## VRMAnimator 实现
- [x] 新建 `frontend/src/modules/avatar/VRMAnimator.ts` 文件
- [x] VRMAnimator 构造函数接收 VRM 实例，创建 `THREE.AnimationMixer(vrm.scene)`
- [x] 实现 `playClip(clip, fadeIn)`：停止当前 action，创建新 clipAction，淡入播放
- [x] 实现 `stop(fadeOut)`：当前 action 淡出
- [x] 实现 `update(delta)`：调用 `mixer.update(delta)`
- [x] 使用 logger 模块记录日志

## ClipBuilder 实现
- [x] 新建 `frontend/src/modules/avatar/ClipBuilder.ts` 文件
- [x] 实现 `buildClip(gloss, vrm)` 主方法，返回 `THREE.AnimationClip`
- [x] HandLocation → VRM scene 本地坐标映射（基于 hips 偏移）
- [x] 调用 IKSolver.solve() 计算肩肘旋转（输入为 scene 本地坐标）
- [x] 生成 5 个采样点的 QuaternionKeyframeTrack（肩、肘）
- [x] 生成手指骨的 QuaternionKeyframeTrack（15 个手指骨 × 1 个手形）
- [x] 生成表情的 NumberKeyframeTrack
- [x] 轨道名使用 VRM rawBoneNode 属性格式（如 `rightUpperArm.quaternion`）

## AvatarDriver 重写
- [x] 移除 vrmQueue/vrmIndex/vrmTime/vrmPlaying/vrmFinished 字段
- [x] 新增 vrmAnimator 字段和 setVRMAnimator 方法
- [x] 重写 playSequence：调用 ClipBuilder.buildClip + vrmAnimator.playClip
- [x] 重写 update：只推进 BonePose 轨道（motionPlayer.update）；VRMAnimator.update 由 VRMModel.useFrame 调用，避免共享实例被重复 update
- [x] 移除 prepareVRMMotion、VRM_LOCATION_OFFSETS、getHandTarget、buildKeyframePose、generateMotion
- [x] getCurrentVRMPose 返回 NEUTRAL_VRM_POSE（兼容性保留）

## VRMModel 简化
- [x] 移除 applyVRMPose 函数
- [x] 移除 applyLimbIK 内部函数
- [x] 移除 computeTargetWorld/toSceneLocal 辅助函数
- [x] 移除 INJECT_TEST_ROTATION 常量及测试代码
- [x] 移除 BoneSmoother 实例化
- [x] 移除 getRestWorldDir/getModelScale/scaleOffsetY 辅助函数
- [x] 移除 REST_WORLD_DIR/MODEL_SCALE/ORIGINAL_HIPS_POS 等 WeakMap 缓存
- [x] 新增 vrmAnimatorRef，VRM 加载完成后创建 VRMAnimator
- [x] useFrame 只调用 vrmAnimator.update(delta) + vrm.update(delta)
- [x] 移除 IK 调试可视化代码

## 废弃文件清理
- [x] 删除 Retargeter.ts
- [x] 删除 Smoother.ts（保留：KalidokitSolver.ts 仍使用 QuaternionSmoother、Avatar3D.tsx 仍使用 BoneSmoother，二者不在本次重写范围）
- [x] 删除 VRMPoseAdapter.ts
- [x] 检查 VRMAdapter.ts 是否被 RealtimePoseDriver 依赖，决定是否删除（保留：RealtimePoseDriver 依赖它）
- [x] 移除 types/avatar.ts 中 VRMPose.ikTargets 字段
- [x] 更新所有被删除模块的 import 语句

## 验证
- [x] VS Code 诊断无 error/warning
- [ ] 输入"你好"后模型手臂从 chest 移动到 face_level
- [ ] 表情（happy）同时生效
- [ ] 词汇间过渡平滑（无骨骼跳变）
- [ ] 帧率 ≥ 50fps
- [x] 代码行数较旧实现减少 30% 以上（VRMModel 909→194 行，减少 78%）
