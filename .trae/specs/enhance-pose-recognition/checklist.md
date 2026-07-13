# Checklist

## 阶段一：运动平滑与 VRM 姿态优化

- [x] `QuaternionSmoother` 类在 `Smoother.ts` 中实现，对每个骨骼维护独立的四元数 One Euro Filter
- [x] 四元数 SLERP 插值函数使用 `THREE.Quaternion.slerp()` 实现，而非欧拉角线性插值
- [x] `QuaternionSmoother` 的 `reset()` 方法正确清除所有骨骼的滤波器历史状态
- [x] `QuaternionSmoother` 单元测试覆盖：正常平滑、动作切换 reset、快速运动自适应
- [x] 现有 `BoneSmoother` 和 `slerpRotation` 保留并标注 `@deprecated`，不影响现有功能
- [x] `VRMAdapter.applyPose()` 使用 `getNormalizedBoneNode()` 替代 `getRawBoneNode()`
- [x] `vrm.update(deltaTime)` 在骨骼旋转设置之前调用（spring bone/lookAt 先更新，再应用姿态）
- [x] VRM 手指骨骼通过标准化 API 正确驱动（旋转值正确映射到 VRM 手指屈曲）
- [x] 不同 rest pose 的 VRM 模型加载后姿态表现一致（不再依赖 `Retargeter.ts` 手动校正）

## 阶段二：全身姿态估计接入

- [x] `PoseEstimator.ts` 模块封装 MediaPipe PoseLandmarker，支持 lite/full/heavy 三档模型
- [x] `PoseEstimate` 类型定义包含 body(33)、leftHand(21)、rightHand(21)、face(468)、timestamp 字段
- [x] 姿态推理在 Web Worker 中执行，主线程通过 `postMessage` 通信
- [x] 低置信度关键点（confidence < 0.5）保留上次有效值并标记 `lowConfidence: true`
- [x] `usePoseTracking` hook 正确管理摄像头生命周期和 PoseEstimator 初始化/销毁
- [x] `useHandTracking.ts` re-export `usePoseTracking`，现有组件引用不报错
- [x] 全身追踪帧率 ≥ 25 FPS，主线程渲染帧率不受 Worker 推理影响

## 阶段三：Kalidokit IK 集成

- [x] `kalidokit` 依赖已安装并可在项目中正常 import
- [x] `KalidokitSolver.ts` 正确封装 `Pose.solve()` 和 `Hand.solve()`，输入 `PoseEstimate`，输出 VRM 骨骼旋转
- [x] Kalidokit 输出的旋转值经过 `QuaternionSmoother` 平滑后输出为 `VRMPose`
- [x] `VRMAdapter.applyRealtimePose(poseEstimate)` 方法走 Kalidokit → 平滑 → VRM 标准化姿态路径
- [x] 实时驱动管线端到端延迟 < 100ms（摄像头 → PoseEstimator → Kalidokit → VRM 渲染）
- [x] 离线动作生成路径（`AvatarDriver` + `IKSolver` + `generateMotion`）功能不受影响
- [x] 实时驱动和离线驱动可以无缝切换（用户开启/关闭摄像头追踪）

## 阶段四：ST-GCN 手势识别原型

- [x] `STGCNRecognizer.ts` 实现 `Recognizer` 接口（init/recognize/isReady/dispose）
- [x] 手部 21 关键点空间图邻接矩阵正确定义（基于 MediaPipe 手部骨骼连接拓扑）
- [x] ST-GCN 模型使用 TensorFlow.js 构建（2 层空间 GCN + 1 层时间卷积）
- [x] 10 种基础手势训练数据每类 ≥ 100 样本，数据格式与 MediaPipe 输出一致
- [x] 训练后模型准确率 ≥ 90%，单帧推理延迟 < 30ms
- [x] 模型导出为 TensorFlow.js 格式并可被 `STGCNRecognizer` 正常加载
- [x] `CompositeRecognizer` 中 `STGCNRecognizer` 优先级高于 `RuleRecognizer`（confidence ≥ 0.8 时采用 ST-GCN 结果）
- [x] `STGCNRecognizer` 初始化失败时系统回退到 `RuleRecognizer`，功能不受影响
