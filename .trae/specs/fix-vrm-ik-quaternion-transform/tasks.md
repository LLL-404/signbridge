# Tasks

- [x] Task 1: 修改 applyLimbIK 函数签名和实现
  - [x] SubTask 1.1: 在 `applyLimbIK` 参数列表新增 `shoulderPos: THREE.Vector3` 和 `wristTargetPos: THREE.Vector3`（世界坐标），新增 `upperArmLen: number` 参数
  - [x] SubTask 1.2: 移除函数内部对 `upperRestQuat`、`lowerRestQuat` 的构建和使用，改为直接使用 `setFromUnitVectors(restDir, targetDir)` 构建目标世界四元数
  - [x] SubTask 1.3: 从 `ikRots.upper` 反推 `upperArmDir`：`upperDeltaQuat = setFromEuler(ikRots.upper)`；`upperArmDir = new THREE.Vector3(0,-1,0).applyQuaternion(upperDeltaQuat)`
  - [x] SubTask 1.4: 计算 `elbowPos = shoulderPos.clone().add(upperArmDir.clone().multiplyScalar(upperArmLen))` 和 `forearmDir = wristTargetPos.clone().sub(elbowPos).normalize()`
  - [x] SubTask 1.5: `upperTargetWorldQuat = new THREE.Quaternion().setFromUnitVectors(upperRestDir, upperArmDir)`
  - [x] SubTask 1.6: `lowerTargetWorldQuat = new THREE.Quaternion().setFromUnitVectors(lowerRestDir, forearmDir)`
  - [x] SubTask 1.7: 保留现有的本地四元数转换、平滑器应用、骨骼写入逻辑不变

- [x] Task 2: 修改 applyVRMPose 中 IK 调用路径，统一使用世界坐标
  - [x] SubTask 2.1: 右手 IK 路径：移除 `shoulderLocal = scene.worldToLocal(shoulderWorld.clone())` 和 `targetLocal = toSceneLocal(...)` 转换，直接使用 `shoulderWorld` 和 `targetWorld`
  - [x] SubTask 2.2: 右手 IK 路径：计算 `targetWorld = hipsWorld.clone().add(scaledOffset.applyQuaternion(sceneQuat))`，其中 `scaledOffset` 由 `toSceneLocal` 内部逻辑提取
  - [x] SubTask 2.3: 右手 IK 路径：`solveArm(shoulderWorld, targetWorld, L1, L2, 'right')`
  - [x] SubTask 2.4: 右手 IK 路径：`applyLimbIK(vrm, 'rightUpperArm', 'rightLowerArm', {upper, lower}, shoulderWorld, targetWorld, L1, 'vrm', smoother, timestamp)`
  - [x] SubTask 2.5: 左手 IK 路径：同步修改为世界坐标
  - [x] SubTask 2.6: 右脚/左脚 IK 路径：同步修改为世界坐标（applyLimbIK 签名变化需同步）

- [x] Task 3: 提取 computeTargetWorld 辅助函数避免重复代码
  - [x] SubTask 3.1: 在 `applyVRMPose` 内部提取 `computeTargetWorld(offset: Vec3): THREE.Vector3` 函数，封装 `scaledOffset + sceneQuat + hipsWorld` 逻辑
  - [x] SubTask 3.2: 右手、左手、右脚、左脚 IK 路径统一调用 `computeTargetWorld`

- [x] Task 4: 验证修复效果
  - [x] SubTask 4.1: VS Code 诊断无新增 error/warning
  - [x] SubTask 4.2: 代码审查确认 `applyLimbIK` 中所有四元数运算使用统一世界坐标系
  - [x] SubTask 4.3: 代码审查确认 `upperTargetWorldQuat × upperRestDir = upperArmDir`（数学正确性）
  - [x] SubTask 4.4: 代码审查确认 `lowerTargetWorldQuat × lowerRestDir = forearmDir`（数学正确性）

# Task Dependencies
- Task 1 独立（修改 applyLimbIK 签名和实现）
- Task 2 依赖 Task 1（调用方需要适配新签名）
- Task 3 可与 Task 2 并行（提取辅助函数）
- Task 4 依赖 Task 1、2、3
