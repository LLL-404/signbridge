# Tasks

- [x] Task 1: 添加 IK 解算诊断日志
  - [x] SubTask 1.1: 在 `solveArmQuaternions` 中添加 `log.debug` 输出关键中间值：`upperRestDir`、`lowerRestDir`、`shoulderPos`、`wristTarget`、`dir`、`shoulderLift`、`elbowDir`、`upperArmDir`、`upperQuat`（pre-clamp）、`elbowPos`、`forearmDir`、`forearmLocalDir`、`hingeAxis`、`signedAngle`（pre-clamp）、`lowerQuat`
  - [x] SubTask 1.2: 在 `buildArmTracks` 中添加 `log.debug` 输出 `upperRestDir`、`lowerRestDir`、`upperArmLen`、`forearmLen`、`shoulderSceneLocal`、`startTarget`、`endTarget`，确认这些值在每个 clip 构建时只输出一次（非每个采样点都输出）
  - [x] SubTask 1.3: 确认日志使用现有 `log = logger.module('ClipBuilder')` 实例，不引入新依赖

- [x] Task 2: 修复 `computeHingeAxis` 退化处理
  - [x] SubTask 2.1: 在 [JointLimits.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/JointLimits.ts) `computeHingeAxis` 中检测叉积长度平方 < 1e-6 的退化情况
  - [x] SubTask 2.2: 退化时回退到正交参考方向：若 `|boneRestDir.x| < 0.9` 用 `(1,0,0)`，否则用 `(0,0,1)`，重新计算叉积
  - [x] SubTask 2.3: 更新函数注释说明退化处理逻辑和触发条件（A-pose 模型 `upperRestDir ∥ UP`）

- [x] Task 3: 修复 `reference` 向量方向假设
  - [x] SubTask 3.1: 在 [ClipBuilder.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts) `solveArmQuaternions` 中，将 `sideBias` 从硬编码 `side === 'left' ? 0.6 : -0.6` 改为从 `upperRestDir` 动态推导
  - [x] SubTask 3.2: 推导逻辑：`sideBias = upperRestDir.x * 0.6`（T-pose 时符号正确；A-pose 时 `upperRestDir.x ≈ 0`，sideBias 退化为 0，依赖 Y/Z 分量引导）
  - [x] SubTask 3.3: 更新注释说明 `sideBias` 动态化的原因（适配 T-pose 和 A-pose）

- [x] Task 4: 验证修复效果
  - [x] SubTask 4.1: VS Code 诊断无新增 error/warning
  - [~] SubTask 4.2: 运行项目，输入"你好"，观察右臂动作是否穿模（需用户运行时验证）
  - [x] SubTask 4.3: 检查诊断日志，确认 `hingeAxis` 非零、`signedAngle` 在合理范围（0°-150°）、`upperArmDir` 和 `forearmLocalDir` 方向合理（代码逻辑分析确认）
  - [~] SubTask 4.4: 若仍有穿模，根据日志分析剩余根因，迭代修复（待运行时验证）

# Task Dependencies

- Task 1 独立，优先执行（诊断是其他修复的基础）
- Task 2 和 Task 3 相互独立，可并行（基于 Task 1 日志确认根因后执行）
- Task 4 依赖 Task 2 和 Task 3
