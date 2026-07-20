# Tasks

- [x] Task 1: 新增 `solveArmQuaternions` 私有函数
  - [x] SubTask 1.1: 在 ClipBuilder.ts 中新增 `solveArmQuaternions` 函数，接收 shoulderPos、wristTarget、upperLen、lowerLen、side、upperRestDir、lowerRestDir 参数
  - [x] SubTask 1.2: 实现余弦定理求肩部抬升角（复用 IKSolver 的几何逻辑）
  - [x] SubTask 1.3: 实现肘部弯曲方向引导（复用 IKSolver 的 reference 向量逻辑）
  - [x] SubTask 1.4: 用 `setFromUnitVectors(upperRestDir, upperArmDir)` 计算肩部四元数
  - [x] SubTask 1.5: 用 `setFromUnitVectors(lowerRestDir, forearmLocalDir)` 计算肘部四元数
  - [x] SubTask 1.6: 函数返回 `{ upper: THREE.Quaternion, lower: THREE.Quaternion }`
- [x] Task 2: 修改 `buildArmTracks` 函数调用新 IK 函数
  - [x] SubTask 2.1: 新增获取 `upperRestDir = lowerNode.position.clone().normalize()` 的逻辑
  - [x] SubTask 2.2: 新增获取 `lowerRestDir = handNode.position.clone().normalize()` 的逻辑
  - [x] SubTask 2.3: 骨骼长度改用 `lowerNode.position.length()` 和 `handNode.position.length()`
  - [x] SubTask 2.4: 调用 `solveArmQuaternions` 替代 `solveArm`
  - [x] SubTask 2.5: 直接使用返回的四元数填充轨道值（不再用 `setFromEuler`）
  - [x] SubTask 2.6: 移除 `import { solve as solveArm } from './IKSolver'`（ClipBuilder 不再使用）
- [x] Task 3: 静态验证
  - [x] SubTask 3.1: 确认 VS Code 诊断 0 error / 0 warning
  - [x] SubTask 3.2: 确认 TypeScript 编译通过（GetDiagnostics 返回空数组）
  - [x] SubTask 3.3: 确认 IKSolver.ts 未被修改（BONE_REST_DIR 仍存在）
- [ ] Task 4: 运行时验证（需用户手动测试）
  - [ ] SubTask 4.1: 启动 dev server，打开文字转手语页面
  - [ ] SubTask 4.2: 输入"你好"并发送，观察模型右手臂是否从胸部正确移动到面部
  - [ ] SubTask 4.3: 确认肘部向前弯曲（不是向后），手臂轨迹自然
  - [ ] SubTask 4.4: 测试其他词汇（如"谢谢"、"你好吗"），确认动作规范
  - [ ] SubTask 4.5: 确认浏览器控制台无异常

# Task Dependencies

- Task 2 依赖 Task 1 完成
- Task 3 依赖 Task 2 完成
- Task 4 依赖 Task 3 通过
