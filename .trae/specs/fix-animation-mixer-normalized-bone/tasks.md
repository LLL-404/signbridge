# Tasks

- [x] Task 1: 把 ClipBuilder 中所有 getRawBoneNode 替换为 getNormalizedBoneNode
  - [x] SubTask 1.1: 修改 `getModelScale` 函数（第 123-126 行）：hips / leftShoulder / rightShoulder / head 四处调用
  - [x] SubTask 1.2: 修改 `buildArmTracks` 函数（第 242-244 行）：upperArm / lowerArm / hand 三处调用
  - [x] SubTask 1.3: 修改 `buildRestArmTracks` 函数（第 312-313 行）：upperArm / lowerArm 两处调用
  - [x] SubTask 1.4: 修改 `buildFingerTracks` 函数（第 354 行）：手指骨一处调用（在循环内）
  - [x] SubTask 1.5: 修改 `buildClip` 函数（第 444 行）：hips 一处调用
  - [x] SubTask 1.6: 更新文件顶部或函数注释，说明使用 normalized bone 的原因（autoUpdateHumanBones 机制）
- [x] Task 2: 静态验证
  - [x] SubTask 2.1: 确认 ClipBuilder.ts 中不再有任何 `getRawBoneNode` 调用（用 Grep 验证）
  - [x] SubTask 2.2: 确认 VS Code 诊断 0 error / 0 warning
  - [x] SubTask 2.3: 确认 TypeScript 编译通过（GetDiagnostics 返回空数组）
- [ ] Task 3: 运行时验证（需用户手动测试）
  - [ ] SubTask 3.1: 启动 dev server，打开文字转手语页面
  - [ ] SubTask 3.2: 输入"你好"并发送，观察模型右手臂是否从胸部移动到面部
  - [ ] SubTask 3.3: 确认"笑"表情同步生效
  - [ ] SubTask 3.4: 确认动作过渡平滑，无明显跳变或穿模
  - [ ] SubTask 3.5: 确认浏览器控制台无 "Track not found" 或 PropertyBinding 相关警告

# Task Dependencies

- Task 2 依赖 Task 1 完成
- Task 3 依赖 Task 2 通过
