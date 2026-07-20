# Checklist

## offsetToSceneLocalTarget 修改验证
- [x] `scaled` 向量的 Z 分量从 `offset.z` 改为 `-offset.z`
- [x] 函数内添加注释说明 Z 取反原因（scene.rotation.y = π）
- [x] 注释说明 X 不取反原因（右臂在 +X 方向）
- [x] Y 坐标仍使用 `scaleOffsetY`，未反转

## 未修改项验证
- [x] `LOCATION_OFFSETS` 数值未被修改（Z 值仍为正值，语义"前方=+Z"）
- [x] `getLocationOffset` 函数未被修改
- [x] `applyMovementOffset` 函数未被修改
- [x] `solveArmQuaternions` 函数未被修改（reference 向量保持原值）
- [x] `IKSolver.ts` 未被修改

## 静态验证
- [x] VS Code 诊断 0 error / 0 warning
- [x] TypeScript 编译通过
- [x] GetDiagnostics 返回空数组

## 运行时验证（需用户手动测试）
- [ ] 输入"你好"后右手臂**向前**伸出（从胸部到面部）
- [ ] 手臂在身体前方移动，不是在背后
- [ ] 肘部自然弯曲（向下/稍后），无明显穿模或抖动
- [ ] 其他词汇（如"谢谢"）动作轨迹在身体前方
- [ ] 浏览器控制台无异常
