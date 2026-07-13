# Tasks

- [x] Task 1: 修复 `offsetToSceneLocalTarget` 中 Z 坐标符号
  - [x] SubTask 1.1: 在 `ClipBuilder.ts` 的 `offsetToSceneLocalTarget` 函数中，把 `scaled` 向量的 Z 分量从 `offset.z` 改为 `-offset.z`
  - [x] SubTask 1.2: 在函数内添加注释说明 Z 取反的原因（scene.rotation.y = π 导致 scene 本地坐标系下"前方"是 -Z）
  - [x] SubTask 1.3: 注释中说明 X 不取反的原因（scene 本地坐标系下右臂在 +X 方向，与 LOCATION_OFFSETS 的 X 正值=右侧 一致）
- [x] Task 2: 静态验证
  - [x] SubTask 2.1: 确认 VS Code 诊断 0 error / 0 warning
  - [x] SubTask 2.2: 确认 TypeScript 编译通过（GetDiagnostics 返回空数组）
  - [x] SubTask 2.3: 确认 `LOCATION_OFFSETS` 数值未被修改（Z 值仍为正值）
  - [x] SubTask 2.4: 确认 `getLocationOffset` 和 `applyMovementOffset` 未被修改
- [ ] Task 3: 运行时验证（需用户手动测试）
  - [ ] SubTask 3.1: 启动 dev server，打开文字转手语页面
  - [ ] SubTask 3.2: 输入"你好"并发送，观察模型右手臂是否**向前**伸出（从胸部到面部）
  - [ ] SubTask 3.3: 确认手臂在身体前方移动，不是在背后
  - [ ] SubTask 3.4: 确认肘部自然弯曲（向下/稍后），无明显穿模或抖动
  - [ ] SubTask 3.5: 测试其他词汇（如"谢谢"），确认动作轨迹在身体前方
  - [ ] SubTask 3.6: 确认浏览器控制台无异常

# Task Dependencies

- Task 2 依赖 Task 1 完成
- Task 3 依赖 Task 2 通过
