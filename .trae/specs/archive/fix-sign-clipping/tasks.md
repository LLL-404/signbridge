# Tasks

- [x] Task 1: 增大 LOCATION_OFFSETS 的 Z 值防穿模
  - [x] SubTask 1.1: 修改 `LOCATION_OFFSETS` 中所有 13 个位置的 Z 值（见 spec.md 表格）
  - [x] SubTask 1.2: 确认注释说明 Z 值含义为"相对 hips 的前方偏移"

- [x] Task 2: 增大肘部引导方向的 Z 分量
  - [x] SubTask 2.1: 修改 `solveArmQuaternions` 中 `reference` 向量从 `(sideBias, -1.0, 0.3)` 改为 `(sideBias, -1.0, 0.6)`
  - [x] SubTask 2.2: 更新注释说明 Z 分量增大的原因（防肘部穿入躯干）

- [x] Task 3: 验证修复效果
  - [x] SubTask 3.1: VS Code 诊断无新增 error/warning
  - [x] SubTask 3.2: 确认 `LOCATION_OFFSETS` 修改不影响 `getLocationOffset` 逻辑（NEUTRAL 分支只改 y/z）
  - [x] SubTask 3.3: 确认 `offsetToSceneLocalTarget` 坐标转换逻辑不受影响（仅数值变化，逻辑不变）

# Task Dependencies
- Task 1 和 Task 2 相互独立，可并行
- Task 3 依赖 Task 1 和 Task 2
