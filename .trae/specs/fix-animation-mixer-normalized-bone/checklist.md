# Checklist

## ClipBuilder 修改验证
- [x] `getModelScale` 函数中 hips / leftShoulder / rightShoulder / head 四处使用 `getNormalizedBoneNode`
- [x] `buildArmTracks` 函数中 upperArm / lowerArm / hand 三处使用 `getNormalizedBoneNode`
- [x] `buildRestArmTracks` 函数中 upperArm / lowerArm 两处使用 `getNormalizedBoneNode`
- [x] `buildFingerTracks` 函数中手指骨使用 `getNormalizedBoneNode`
- [x] `buildClip` 函数中 hips 使用 `getNormalizedBoneNode`
- [x] ClipBuilder.ts 中不再有任何 `getRawBoneNode` 调用

## 静态验证
- [x] VS Code 诊断 0 error / 0 warning
- [x] TypeScript 编译通过

## 运行时验证（需用户手动测试）
- [ ] 输入"你好"后模型右手臂从胸部移动到面部
- [ ] "笑"表情同步生效
- [ ] 动作过渡平滑，无明显跳变
- [ ] 浏览器控制台无 "Track not found" 或 PropertyBinding 警告
