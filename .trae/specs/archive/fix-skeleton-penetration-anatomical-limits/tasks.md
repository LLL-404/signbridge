# Tasks

- [x] Task 1: 新增 BodyVolume 身体包络体模块
  - [x] SubTask 1.1: 新建 `frontend/src/modules/avatar/BodyVolume.ts`，定义躯干胶囊体（中轴=spine→chest→neck，半径=肩宽×0.45，高度=hips→neck）、头部球（中心=头部骨骼位置，半径=头骨长度×0.6）、上臂/前臂胶囊体（半径=骨骼长度×0.12）
  - [x] SubTask 1.2: 实现 `buildBodyVolume(vrm: VRM): BodyVolume`，从 VRM normalized bone 实际世界位置推导所有包络参数，不硬编码数值
  - [x] SubTask 1.3: 实现穿透检测函数：`isInsideTorso(point): boolean`、`isInsideHead(point): boolean`、`projectToSurface(point, volume): Vector3`（沿最近外法线投影到包络表面，保留切向分量）
  - [x] SubTask 1.4: 胶囊体穿透检测使用「点到线段距离 vs 半径」算法，头部球用「点中心距离 vs 半径」

- [x] Task 2: 轨迹目标点合法性约束
  - [x] SubTask 2.1: 在 `ClipBuilder.buildArmTracks` 中，buildMovementTrajectory 生成轨迹后、IK 解算前，对每个 trajectory point 调用 BodyVolume 穿透检测
  - [x] SubTask 2.2: 若点在躯干胶囊或头部球内，调用 `projectToSurface` 投影到表面，用投影后的点替换原 point.position
  - [x] SubTask 2.3: 在 buildArmTracks 顶部调用 buildBodyVolume(vrm) 构建包络（每 clip 构建一次，非每点构建）

- [x] Task 3: 肘部穿透修正
  - [x] SubTask 3.1: 在 `solveArmQuaternions` 返回 upper/lower 四元数后，新增肘部位置穿透检测：用 elbowPos（已计算）检测是否在躯干胶囊内
  - [x] SubTask 3.2: 若穿入，将 elbowPos 沿躯干外法线推到表面，用修正后的 elbowPos 重算 forearmDir 与 lowerQuat
  - [x] SubTask 3.3: 将肘引导方向从硬编码 `(sideBias,-1,0.6)` 改为基于 `shoulder→hips` 向量动态推导：elbowDir 参考 hips 方向倾斜，确保 A-pose（upperRestDir.x≈0）时仍有正确引导
  - [x] SubTask 3.4: solveArmQuaternions 签名新增 BodyVolume 参数（或在外部 buildArmTracks 中做修正，避免改 IK 函数签名——实现时择优）

- [x] Task 4: 解剖学关节限制增强
  - [x] SubTask 4.1: 在 JointLimits.ts 新增肩关节分方向限制函数 `constrainShoulderByDirection(upperQuat, upperRestDir, limits)`，从四元数分解主旋转方向（外展/前屈/后伸），分别钳制到 120°/180°/60°
  - [x] SubTask 4.2: 在 JointLimits.ts 新增肘关节旋前旋后限制函数 `constrainForearmRotation(lowerQuat, hingeAxis, maxPronation=80°, maxSupination=80°)`，从 lowerQuat 分解轴向旋转分量并钳制
  - [x] SubTask 4.3: 在 ClipBuilder.solveArmQuaternions 中用新函数替换原 `clampRotationAngle(upperQuat, 170°)` 与补充肘部轴向限制
  - [x] SubTask 4.4: 限制值定义为 JointLimits 常量并附注释标注人体测量学数据来源

- [x] Task 5: 静态校验
  - [x] SubTask 5.1: tsc --noEmit 通过，0 error
  - [x] SubTask 5.2: eslint 通过，0 error/warning

- [x] Task 6: 运行时穿模验证（强制，不可跳过）
  - [x] SubTask 6.1: 启动 dev server，输入「你好」播放，收集穿模统计日志：轨迹点/躯干穿入/头部穿入/肘部穿入
  - [x] SubTask 6.2: 输入「朋友」播放，收集双手穿模统计日志
  - [x] SubTask 6.3: 输入「吃饭」「过来」播放，收集穿模统计日志
  - [x] SubTask 6.4: 数据级验证结果（4 词条全部 0 穿入）：你好(gloss_001,right,5点,0/0/0)、朋友(right+left,0/0/0)、吃饭(gloss_571,right,6点,0/0/0)、过来(gloss_570,right,5点,0/0/0)

- [x] Task 7: 更新 CHANGELOG.md
  - [x] SubTask 7.1: 在 [Unreleased] 记录：feat(avatar): 新增 BodyVolume 身体包络体模块；fix(avatar): 修复手臂穿模（目标点合法性约束+肘部穿透修正+解剖学关节限制）

# Task Dependencies
- Task 1（BodyVolume）是基础，Task 2 和 Task 3 依赖它
- Task 4（关节限制）独立，可与 Task 1/2/3 并行
- Task 5 依赖 Task 1-4
- Task 6 依赖 Task 5
- Task 7 依赖 Task 6 验证通过
