# Tasks

## 阶段一：运动平滑与 VRM 姿态优化（低风险，高收益）

- [x] Task 1: 四元数 SLERP 平滑器
  - [x] SubTask 1.1: 在 `Smoother.ts` 中新增 `QuaternionSmoother` 类，对每个骨骼维护四元数 One Euro Filter
  - [x] SubTask 1.2: 实现真正的四元数 SLERP 插值函数（替代当前 `slerpRotation` 的欧拉角 lerp）
  - [x] SubTask 1.3: 为 `QuaternionSmoother` 编写单元测试，验证旋转平滑和 reset 行为
  - [x] SubTask 1.4: 保留现有 `BoneSmoother` 和 `slerpRotation` 不删除，标注 `@deprecated`

- [x] Task 2: VRM 标准化姿态 API 迁移
  - [x] SubTask 2.1: 修改 `VRMAdapter.applyPose()`，使用 `humanoid.getNormalizedBoneNode()` 替代 `getRawBoneNode()`
  - [x] SubTask 2.2: 修正 `VRMAdapter.update()` 调用时序：确保 `vrm.update()` 在骨骼旋转设置之前调用
  - [x] SubTask 2.3: 验证手指骨骼通过标准化 API 正确驱动（VRM 手指骨骼名映射不变）
  - [x] SubTask 2.4: 验证 `Retargeter.ts` 中的 rest pose 校正在标准化 API 下是否仍需要（预期可移除）

## 阶段二：全身姿态估计接入（中风险，核心功能）

- [x] Task 3: PoseEstimator 模块
  - [x] SubTask 3.1: 新建 `frontend/src/modules/recognition/PoseEstimator.ts`，封装 MediaPipe PoseLandmarker
  - [x] SubTask 3.2: 定义 `PoseEstimate` 类型（body: 33点, leftHand/rightHand: 21点, face: 468点, timestamp）
  - [x] SubTask 3.3: 实现 Web Worker 封装，主线程通过 `postMessage` 传递视频帧，Worker 返回 `PoseEstimate`
  - [x] SubTask 3.4: 实现低置信度关键点保持上次有效值的逻辑

- [x] Task 4: usePoseTracking Hook
  - [x] SubTask 4.1: 新建 `usePoseTracking.ts`，整合 `PoseEstimator` 和摄像头管理
  - [x] SubTask 4.2: 输出 `PoseEstimate` 给下游模块（Kalidokit 解算、手势识别）
  - [x] SubTask 4.3: 在 `useHandTracking.ts` 中 re-export `usePoseTracking`，保持向下兼容

## 阶段三：Kalidokit IK 集成（中风险，关键路径）

- [x] Task 5: Kalidokit 集成层
  - [x] SubTask 5.1: 安装 `kalidokit` 依赖
  - [x] SubTask 5.2: 新建 `frontend/src/modules/avatar/KalidokitSolver.ts`，封装 `Pose.solve()` + `Hand.solve()`
  - [x] SubTask 5.3: 将 Kalidokit 输出的旋转值通过 `QuaternionSmoother` 平滑后输出 `VRMPose`
  - [x] SubTask 5.4: 在 `VRMAdapter` 中新增 `applyRealtimePose(poseEstimate)` 方法，走 Kalidokit → 平滑 → VRM 标准化姿态路径

- [x] Task 6: 实时驱动管线打通
  - [x] SubTask 6.1: 在渲染循环中连接 `usePoseTracking` → `KalidokitSolver` → `VRMAdapter.applyRealtimePose`
  - [x] SubTask 6.2: 验证全身追踪到 VRM 驱动的端到端延迟 < 100ms
  - [x] SubTask 6.3: 验证离线动作生成路径（`AvatarDriver` + `IKSolver`）不受影响

## 阶段四：ST-GCN 手势识别原型（高风险，实验性）

- [x] Task 7: STGCNRecognizer 基础结构
  - [x] SubTask 7.1: 新建 `frontend/src/modules/recognition/STGCNRecognizer.ts`，实现 `Recognizer` 接口
  - [x] SubTask 7.2: 定义手部 21 关键点的空间图邻接矩阵（基于 MediaPipe 手部骨骼连接）
  - [x] SubTask 7.3: 实现轻量 ST-GCN 模型（2 层空间 GCN + 1 层时间卷积），用 TensorFlow.js 构建
  - [x] SubTask 7.4: 收集/生成 10 种基础手势的训练数据（每类 ≥ 100 样本）

- [x] Task 8: ST-GCN 训练与集成
  - [x] SubTask 8.1: 训练 ST-GCN 模型，目标准确率 ≥ 90%
  - [x] SubTask 8.2: 导出模型为 TensorFlow.js 格式，在 `STGCNRecognizer` 中加载
  - [x] SubTask 8.3: 在 `CompositeRecognizer` 中注册 `STGCNRecognizer`，设置优先级回退逻辑
  - [x] SubTask 8.4: 验证 `STGCNRecognizer` 初始化失败时回退到 `RuleRecognizer`

# Task Dependencies

- Task 2 依赖 Task 1（VRM 迁移后需要四元数平滑配合验证）
- Task 4 依赖 Task 3（Hook 依赖 PoseEstimator 模块）
- Task 5 依赖 Task 1 + Task 3（Kalidokit 输出需要四元数平滑，输入依赖 PoseEstimator）
- Task 6 依赖 Task 2 + Task 4 + Task 5（端到端管线需要所有前置模块就绪）
- Task 7 可与 Task 3-6 并行（独立模块，仅依赖 `Recognizer` 接口）
- Task 8 依赖 Task 7
