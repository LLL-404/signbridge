# Tasks

- [x] Task 1: 修正解析法路径肘部穿透——上臂旋转同步修正
  - [x] SubTask 1.1: 读取 `frontend/src/modules/avatar/ClipBuilder.ts` 第 579-598 行，理解当前肘部穿透修正逻辑（只修正 `correctedElbowPos` 用于 `forearmDir`，未重算 `upperQuat`）
  - [x] SubTask 1.2: 在 `if (elbowPenetrated)` 块中，用 `correctedElbowPos` 重新计算 `upperArmDir = (correctedElbowPos - S).normalize()`，然后重新生成 `upperQuat = setFromUnitVectors(upperRestDir, upperArmDir)`
  - [x] SubTask 1.3: 确保重新生成的 `upperQuat` 仍经过第 603 行 `constrainShoulderByDirection(upperQuat, upperRestDir)` 约束（修正逻辑在第 603 行之前执行，约束自动应用到修正后的值）
  - [x] SubTask 1.4: 验证 `invUpper`（第 595 行）使用修正后的 `upperQuat` 重新计算，确保 `forearmLocalDir` 基于修正后的肩部旋转

- [x] Task 2: 修正 FABRIK 路径肘部穿透——添加上臂四元数重算
  - [x] SubTask 2.1: 读取 `frontend/src/modules/avatar/ClipBuilder.ts` 第 486-497 行 FABRIK 路径，确认当前只检测 `elbowPenetratedFabrik` 不修正
  - [x] SubTask 2.2: 在检测到 `elbowPenetratedFabrik=true` 时，用 `projectToSurface` 修正 `elbowPosFabrik`，然后重新计算 `upperArmDirFabrik = (correctedElbowFabrik - shoulderPos).normalize()`，重算 `upperQuatFabrik = setFromUnitVectors(upperRestDir, upperArmDirFabrik)`
  - [x] SubTask 2.3: 确保重算的 `upperQuatFabrik` 经过 `constrainShoulderByDirection` 约束

- [x] Task 3: 单元测试验证穿模修正
  - [x] SubTask 3.1: 在 `ClipBuilder.anatomical-correctness.test.ts` 的"无穿模断言"区段，新增测试用例：构造会导致肘部穿透的手腕目标位置，验证修正后上臂方向不穿入躯干
  - [x] SubTask 3.2: 确保现有穿模测试用例（test_005 等）仍通过

- [x] Task 4: 全量验证
  - [x] SubTask 4.1: `npx tsc --noEmit -p tsconfig.app.json` 0 errors
  - [x] SubTask 4.2: `npm run lint` 0 errors 0 warnings
  - [x] SubTask 4.3: `npm run test` 全部通过（821 passed）
  - [x] SubTask 4.4: `npm run build` 构建成功

- [x] Task 5: 更新 CHANGELOG 并提交
  - [x] SubTask 5.1: 在 `CHANGELOG.md` [Unreleased] 记录变更（fix(avatar): 肘部穿透修正——上臂旋转同步重算）
  - [x] SubTask 5.2: git commit + push 成功（commit e204069）
  - [x] SubTask 5.3: 监控 CI 流水线全绿（CI 29878794665 + Deploy Pages 29878794663 均 success）

# Task Dependencies

- Task 1、2 相互独立（不同 IK 路径），可并行
- Task 3 依赖 Task 1、2 完成
- Task 4 依赖 Task 3 完成
- Task 5 依赖 Task 4 通过
