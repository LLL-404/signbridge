# Tasks

- [x] Task 1: 修复 smoother 每帧 reset 问题
  - [x] SubTask 1.1: 在 VRMModel 中添加 ref 跟踪上一次 VRMPose 是否包含 ikTargets
  - [x] SubTask 1.2: 修改 useEffect：仅在 ikTargets 存在性从 false→true 或 true→false 切换时调用 smoother.reset()，而非每次 vrmPose 引用变化时

- [x] Task 2: 修复 getRestWorldDir 矩阵更新
  - [x] SubTask 2.1: 在 getRestWorldDir 函数中，读取子骨骼世界位置前调用 childNode.updateWorldMatrix(true, false)

- [x] Task 3: 添加 IK 诊断日志
  - [x] SubTask 3.1: 在 applyVRMPose 的右手 IK 路径添加日志：ikTargets 存在性、骨骼查找结果、IK 输入参数（shoulder, target, lengths）
  - [x] SubTask 3.2: 添加 IK 解算结果日志：shoulderRotation 和 elbowRotation 值
  - [x] SubTask 3.3: 添加最终写入日志：upperNode 和 lowerNode 的 quaternion 值
  - [x] SubTask 3.4: 对左手 IK 路径添加同样日志

- [x] Task 4: 添加 IK 目标可视化调试
  - [x] SubTask 4.1: VRMModel 添加 showIKDebug prop（默认 false）
  - [x] SubTask 4.2: 在 useFrame 中收集当前 IK 目标的世界坐标，存入 ref
  - [x] SubTask 4.3: 渲染小球体（红色=右手目标，蓝色=左手目标）在 IK 目标位置

- [x] Task 5: 添加直接骨骼旋转注入测试
  - [x] SubTask 5.1: 在 applyVRMPose 中添加 `INJECT_TEST_ROTATION` 常量（默认 false）
  - [x] SubTask 5.2: 当 INJECT_TEST_ROTATION 为 true 时，直接对 rightUpperArm 设置固定旋转（x: -1.5, y: 0, z: 0），绕过 IK
  - [x] SubTask 5.3: 验证模型手臂是否抬起——若抬起则证明骨骼可旋转，问题在 IK；若不抬起则问题在骨骼查找

- [x] Task 6: 端到端验证
  - [x] SubTask 6.1: 开启浏览器控制台，输入"你好"，检查 IK 诊断日志输出
  - [x] SubTask 6.2: 根据日志判断：IK 输入是否正确（target/shoulder 位置）、IK 输出是否合理（旋转值非零）、骨骼是否找到
  - [x] SubTask 6.3: 开启 showIKDebug，验证 IK 目标球体位置是否在合理位置（胸前/面部高度）
  - [x] SubTask 6.4: 开启 INJECT_TEST_ROTATION，验证骨骼是否能被直接旋转
  - [x] SubTask 6.5: 根据诊断结果修复具体问题
  - [x] SubTask 6.6: VS Code 诊断无新增 error/warning

# Task Dependencies
- Task 1, 2, 3 独立，可并行
- Task 4 依赖 Task 3（需要 IK 目标坐标收集逻辑）
- Task 5 独立
- Task 6 依赖所有前置任务
