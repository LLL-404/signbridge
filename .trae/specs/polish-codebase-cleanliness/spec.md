# 代码库整洁度打磨 Spec

## Why

经过多轮 spec 驱动迭代，项目 CI 全绿、lint 零警告、820 个单元测试通过。但在系统性调研中发现若干"非阻塞但影响整洁度"的残留问题：3 处 `@deprecated` 标注与代码实际状态不符（1 处可删除、2 处标注不准确）、`config.ts` 注释遗漏 2 个环境变量、`vitest.config.ts` 覆盖率阈值偏低且覆盖范围受限。本 spec 聚焦这些低风险高确定性的打磨项，不引入新功能。

## What Changes

- 删除 `Smoother.ts` 中无任何调用方的 `slerpRotation` 函数（@deprecated 且实际未使用）
- 修正 `Smoother.ts` 中 `BoneSmoother` 类的 `@deprecated` 标注——该类仍被 `Avatar3D.tsx` 使用，并非废弃，注释改为说明保留用途
- 修正 `types/avatar.ts` 中 `BonePose` 的 `@deprecated` 标注——该类型被 100+ 处引用，仍服务于 2D/skeleton 模式，注释改为说明保留用途
- 同步 `config.ts` 顶部注释的环境变量列表，补全 `VITE_POSE_MODEL_URL` 和 `VITE_HAND_MODEL_URL`
- 跑一次 `npm run test:coverage` 获取当前 modules/ 覆盖率基线，根据实际值将 `vitest.config.ts` 阈值从 50% 提升到合理目标（不降级、不设定无法达成的值）

## Impact

- Affected specs: 无（纯整洁性打磨，不影响功能）
- Affected code:
  - `frontend/src/modules/avatar/Smoother.ts` — 删除 `slerpRotation` 函数，修正 `BoneSmoother` 注释
  - `frontend/src/types/avatar.ts` — 修正 `BonePose` 注释
  - `frontend/src/config.ts` — 补全注释中环境变量列表
  - `frontend/vitest.config.ts` — 可能调整 coverage thresholds（视基线而定）
- Affected docs: `CHANGELOG.md` 记录变更
- 风险:
  - 删除 `slerpRotation` 需确认无引用（已 Grep 验证仅定义处出现）
  - 修改 `@deprecated` 注释不影响运行时行为
  - 提升覆盖率阈值后若当前值低于新阈值会导致 `test:coverage` 失败，需先确认基线

## ADDED Requirements

### Requirement: 无未使用的 @deprecated 代码

项目 SHALL 不保留标注 `@deprecated` 且实际无任何调用方的导出代码。

#### Scenario: slerpRotation 已删除
- **WHEN** 在 `frontend/src` 中 Grep 搜索 `slerpRotation`
- **THEN** 无匹配结果（定义处已删除）

### Requirement: @deprecated 标注准确性

项目 SHALL 仅在代码确实计划被取代且有明确替代路径时使用 `@deprecated` 标注；仍被生产代码使用的导出 SHALL NOT 标注为 `@deprecated`。

#### Scenario: BoneSmoother 标注修正
- **WHEN** 读取 `Smoother.ts` 中 `BoneSmoother` 类定义
- **THEN** 不出现 `@deprecated`
- **AND** 注释说明"用于 Avatar3D skeleton 模式的骨骼旋转平滑"

#### Scenario: BonePose 标注修正
- **WHEN** 读取 `types/avatar.ts` 中 `BonePose` 接口定义
- **THEN** 不出现 `@deprecated`
- **AND** 注释说明"2D/skeleton 模式使用的姿态结构"

### Requirement: config.ts 注释完整性

`config.ts` 顶部注释 SHALL 列出所有 `appConfig` 中读取的环境变量，与代码保持一致。

#### Scenario: 注释列出全部 8 个环境变量
- **WHEN** 读取 `config.ts` 顶部注释
- **THEN** 包含 `VITE_APP_NAME`、`VITE_MEDIAPIPE_WASM_BASE_URL`、`VITE_MEDIAPIPE_HANDS_CDN_BASE`、`VITE_GESTURE_MODEL_URL`、`VITE_POSE_MODEL_URL`、`VITE_HAND_MODEL_URL`、`VITE_GESTURE_LIBRARY_URL`、`VITE_VOCABULARY_URL` 共 8 个

### Requirement: 覆盖率阈值反映实际水平

`vitest.config.ts` 的 coverage thresholds SHALL 不低于当前实际覆盖率水平，且覆盖范围与 `include` 配置匹配。

#### Scenario: 阈值不低于基线
- **WHEN** 执行 `npm run test:coverage`
- **THEN** 退出码为 0
- **AND** 实际覆盖率 ≥ 阈值设定值

## MODIFIED Requirements

无

## REMOVED Requirements

无
