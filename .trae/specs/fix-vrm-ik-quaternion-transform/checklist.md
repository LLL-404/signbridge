# Checklist

- [x] applyLimbIK 函数签名新增 shoulderPos、wristTargetPos、upperArmLen 参数
- [x] applyLimbIK 中 upperTargetWorldQuat 使用 setFromUnitVectors(upperRestDir, upperArmDir) 构建
- [x] applyLimbIK 中 upperArmDir 通过 (0,-1,0).applyQuaternion(upperDeltaQuat) 反推
- [x] applyLimbIK 中 lowerTargetWorldQuat 使用 setFromUnitVectors(lowerRestDir, forearmDir) 构建
- [x] applyLimbIK 中 forearmDir 通过 (wristTargetPos - elbowPos).normalize() 重新计算
- [x] applyLimbIK 中 elbowPos = shoulderPos + upperArmDir × upperArmLen
- [x] applyLimbIK 中不再使用 upperRestQuat.clone().multiply(upperDeltaQuat) 错误公式
- [x] applyLimbIK 中不再使用 lowerRestQuat.clone().multiply(lowerDeltaQuat) 错误公式
- [x] applyVRMPose 右手 IK 路径使用世界坐标调用 solveArm
- [x] applyVRMPose 左手 IK 路径使用世界坐标调用 solveArm
- [x] applyVRMPose 右脚 IK 路径使用世界坐标调用 solveLeg
- [x] applyVRMPose 左脚 IK 路径使用世界坐标调用 solveLeg
- [x] applyVRMPose 中提取 computeTargetWorld 辅助函数避免重复
- [x] applyVRMPose 中不再调用 scene.worldToLocal 转换 IK 输入坐标
- [x] VS Code 诊断无新增 error/warning
- [x] 代码审查确认数学正确性：upperTargetWorldQuat × upperRestDir = upperArmDir
- [x] 代码审查确认数学正确性：lowerTargetWorldQuat × lowerRestDir = forearmDir
