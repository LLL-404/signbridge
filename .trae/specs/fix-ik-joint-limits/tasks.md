# Tasks

- [x] Task 1: 实现肘关节铰链约束函数
  - [x] SubTask 1.1: 在 `solveArmQuaternions` 中计算铰链轴：`hingeAxis = upperRestDir.clone().cross(UP).normalize()`，其中 `UP = new THREE.Vector3(0, 1, 0)`
  - [x] SubTask 1.2: 从 `lowerRestDir` 和 `forearmLocalDir` 直接提取旋转轴和角度（比从四元数提取更稳定）
  - [x] SubTask 1.3: 计算带符号的投影角度：`signedAngle = rotationAxis.dot(hingeAxis) * angle`
  - [x] SubTask 1.4: 钳制弯曲角度到 [0°, 150°]（两臂方向一致，因铰链轴与旋转轴同时翻转，修正了 spec 中"左臂 clamp(-150°, 0)"的错误假设）
  - [x] SubTask 1.5: 用铰链轴和钳制后的角度重建 `lowerQuat`：`new THREE.Quaternion().setFromAxisAngle(hingeAxis, clampedAngle)`

- [x] Task 2: 实现肩关节角度约束
  - [x] SubTask 2.1: 从 `upperQuat` 提取旋转角度：`angle = 2 * Math.acos(Math.abs(upperQuat.w))`
  - [x] SubTask 2.2: 如果角度 > degToRad(170)，提取旋转轴并钳制角度到 170°（w < 0 时翻转旋转轴方向）
  - [x] SubTask 2.3: 用钳制后的角度重建 `upperQuat`：`upperQuat.setFromAxisAngle(axis, clampedAngle)`

- [x] Task 3: 在 solveArmQuaternions 返回前应用约束
  - [x] SubTask 3.1: 在 `return` 之前依次应用肩关节约束（第 6 步）和肘关节铰链约束（第 7 步）
  - [x] SubTask 3.2: 铰链轴计算依赖 `upperRestDir`（T-pose 固定值），不受肩部约束影响

- [x] Task 4: 验证修复效果
  - [x] SubTask 4.1: VS Code 诊断无新增 error/warning
  - [x] SubTask 4.2: 代码审查确认铰链轴计算正确（右臂 ≈ (0,0,-1)，左臂 ≈ (0,0,1)）
  - [x] SubTask 4.3: 代码审查确认弯曲方向符号正确（两臂正弯曲 signedAngle > 0，反向 < 0 钳制到 0）

# Task Dependencies
- Task 1 和 Task 2 相互独立，可并行
- Task 3 依赖 Task 1 和 Task 2
- Task 4 依赖 Task 3
