# Tasks

- [x] Task 1: 创建 JointLimits.ts 工具文件
  - [x] SubTask 1.1: 新建 `frontend/src/modules/avatar/JointLimits.ts`
  - [x] SubTask 1.2: 实现 `clampRotationAngle(quat, maxAngleRad)`：提取旋转角度，超限时钳制并重建四元数（w < 0 时翻转旋转轴）
  - [x] SubTask 1.3: 实现 `computeHingeAxis(boneRestDir, referenceDir)`：返回 `boneRestDir × referenceDir` 归一化结果
  - [x] SubTask 1.4: 实现 `constrainHingeJoint(restDir, targetDir, hingeAxis, minAngleRad, maxAngleRad)`：从 restDir/targetDir 提取旋转轴和角度，投影到铰链轴，钳制到 [min, max]，用铰链轴重建四元数

- [x] Task 2: 在 ClipBuilder.ts 中用工具函数替换内联约束
  - [x] SubTask 2.1: 在 ClipBuilder.ts 顶部导入 JointLimits 的三个函数
  - [x] SubTask 2.2: 替换肩关节约束为 `upperQuat.copy(clampRotationAngle(upperQuat, degToRad(170)))`
  - [x] SubTask 2.3: 替换肘关节铰链约束为 `computeHingeAxis(upperRestDir, UP)` + `constrainHingeJoint(...)`
  - [x] SubTask 2.4: 内联约束代码已移除，保留说明性注释

- [x] Task 3: 验证重构正确性
  - [x] SubTask 3.1: VS Code 诊断无新增 error/warning
  - [x] SubTask 3.2: 确认 `clampRotationAngle` 的 w < 0 翻转逻辑与原内联实现一致
  - [x] SubTask 3.3: 确认 `constrainHingeJoint` 的投影和钳制逻辑与原内联实现一致
  - [x] SubTask 3.4: 确认 `computeHingeAxis(upperRestDir, UP)` 结果与原 `upperRestDir.cross(UP).normalize()` 一致

# Task Dependencies
- Task 1 独立（创建新文件）
- Task 2 依赖 Task 1（需要导入工具函数）
- Task 3 依赖 Task 2
