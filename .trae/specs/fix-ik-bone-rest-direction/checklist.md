# Checklist

## solveArmQuaternions 函数实现
- [x] 新增 `solveArmQuaternions` 函数，接收 7 个参数（shoulderPos、wristTarget、upperLen、lowerLen、side、upperRestDir、lowerRestDir）
- [x] 实现余弦定理求肩部抬升角
- [x] 实现肘部弯曲方向引导（reference 向量 + 投影到垂直平面）
- [x] 肩部四元数用 `setFromUnitVectors(upperRestDir, upperArmDir)`
- [x] 肘部四元数用 `setFromUnitVectors(lowerRestDir, forearmLocalDir)`
- [x] 返回类型为 `{ upper: THREE.Quaternion, lower: THREE.Quaternion }`

## buildArmTracks 修改验证
- [x] 动态获取 `upperRestDir = lowerNode.position.clone().normalize()`
- [x] 动态获取 `lowerRestDir = handNode.position.clone().normalize()`
- [x] 骨骼长度使用 `lowerNode.position.length()` 和 `handNode.position.length()`
- [x] 调用 `solveArmQuaternions` 替代 `solveArm`
- [x] 直接使用返回的四元数填充轨道值（不经 setFromEuler）

## 静态验证
- [x] VS Code 诊断 0 error / 0 warning
- [x] TypeScript 编译通过
- [x] IKSolver.ts 未被修改

## 运行时验证（需用户手动测试）
- [ ] 输入"你好"后右手臂从胸部正确移动到面部
- [ ] 肘部向前弯曲（不是向后）
- [ ] 手臂轨迹自然，无明显穿模或抖动
- [ ] 其他词汇（如"谢谢"）动作规范
- [ ] 浏览器控制台无异常
