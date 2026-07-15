# 手语动作生成系统修复 Spec

## Why
用户反馈"手语动作完全不对"。经代码审查定位根因：动作生成管道（ClipBuilder）存在三个致命缺陷——
1. Movement 字段在起止位置不同时被完全忽略，仅在位置相同时作为简单方向偏移；
2. `applyMovementOffset` 只处理 8 个旧 movement 值，11 个枚举值（含全部 7 个新增值）落入 default 产生零运动；
3. 手臂轨迹用 `lerpVectors` 做纯线性插值，无法表达摆动/点触/圆弧/之字形等真实手语运动模式。
此外 `palm_orientation` 在 ClipBuilder 中零引用，手腕掌向完全由 IK 决定，词汇数据被丢弃。

## What Changes
- 重构 `buildArmTracks`：用基于 movement 类型的**轨迹生成函数**替换 `lerpVectors` 线性插值，支持多关键帧曲线路径
- 新增 `buildMovementTrajectory(movement, startTarget, endTarget, durationSec)` 函数，按 19 种 Movement 枚举生成对应的关键帧序列：
  - 线性类（UPWARD/DOWNWARD/LEFTWARD/RIGHTWARD/TOWARD_BODY/AWAY_FROM_BODY/FORWARD）：保持线性
  - 弧线类（UPWARD_ARC/DOWNWARD_ARC）：中点抬高/降低的抛物线路径
  - 圆形（CIRCULAR）：绕中心点的圆周路径
  - 之字形（ZIGZAG）：多段折线路径
  - 摆动（WAVE/SIDE_TO_SIDE）：往复振荡路径
  - 点触（TAP/TAP_TWICE）：快速往返的接触-分离路径
  - 勾连（HOOK_TOGETHER）：双手向中心汇聚路径
  - 扭转（WAVE_TWIST）：摆动 + 腕部旋转
  - 直线类（HORIZONTAL_LINE/VERTICAL_LINE）：保持线性
- 修改 `buildClip`：**移除** `if (locStart === locEnd && m.movement !== STATIC)` 条件守卫，movement 始终传给轨迹生成函数（STATIC 时退化为线性）
- 新增 `applyPalmOrientation(wristQuat, orientation, side)` 函数：在 IK 解算的四元数上叠加掌向旋转修正
- 修改 `buildArmTracks`：读取 `gloss.manual.palm_orientation`，在生成手部轨道时叠加掌向旋转
- 统一 ClipBuilder 与 AvatarDriver 的 movement 处理逻辑，消除重复 switch

## Impact
- Affected code: `ClipBuilder.ts`（核心修改）, `AvatarDriver.ts`（同步 movement 处理）
- Affected specs: `expand-sign-vocabulary`（词汇数据现在会被正确消费）, `fix-sign-animation-pipeline`（管道下游的 clip 质量提升）
- **BREAKING**: `buildArmTracks` 的内部采样逻辑变更，5 点线性采样 → N 点轨迹采样

## ADDED Requirements

### Requirement: 轨迹生成函数
系统 SHALL 提供 `buildMovementTrajectory` 函数，根据 Movement 枚举值生成多关键帧的 3D 路径点序列，替代原有的线性插值。

#### Scenario: 摆动运动
- **WHEN** movement 为 WAVE，起止位置相同
- **THEN** 生成往复振荡路径（≥5 个关键帧），手腕在 X 轴方向左右摆动至少 2 个周期

#### Scenario: 点触运动
- **WHEN** movement 为 TAP_TWICE，起止位置在胸部
- **THEN** 生成两次快速接触-分离路径，手腕 Z 方向有 2 次前后往复

#### Scenario: 圆弧运动
- **WHEN** movement 为 CIRCULAR
- **THEN** 生成绕中心点的圆周路径（≥8 个关键帧），形成可见的圆形轨迹

#### Scenario: 弧线运动
- **WHEN** movement 为 UPWARD_ARC，起点腹部终点肩部
- **THEN** 中间关键帧的 Y 值高于线性插值结果，形成上凸弧线

#### Scenario: 静态运动
- **WHEN** movement 为 STATIC
- **THEN** 所有关键帧位置相同（起止位置一致），无运动

#### Scenario: 线性运动保持兼容
- **WHEN** movement 为 UPWARD 且起止位置不同
- **THEN** 生成从起点到终点的线性路径（与原行为兼容）

### Requirement: 掌向旋转修正
系统 SHALL 在 IK 解算的手腕四元数上叠加 `palm_orientation` 对应的旋转修正，使手掌朝向与词汇数据一致。

#### Scenario: 掌心向内
- **WHEN** palm_orientation 为 INWARD
- **THEN** 手掌朝向身体（+Z 方向，模型面朝 +Z 时掌心向 -Z）

#### Scenario: 掌心向上
- **WHEN** palm_orientation 为 UPWARD
- **THEN** 手掌朝向 +Y 方向

#### Scenario: 掌心向外
- **WHEN** palm_orientation 为 OUTWARD
- **THEN** 手掌朝向 +Z 方向（背离身体）

### Requirement: movement 字段始终生效
`buildClip` SHALL 移除 `locStart === locEnd` 条件守卫，movement 字段在所有情况下都传给轨迹生成函数。

#### Scenario: 起止位置不同且有 movement
- **WHEN** location_start 为 ABDOMEN_LEVEL，location_end 为 CHEST_CENTER，movement 为 UPWARD_ARC
- **THEN** 手沿上凸弧线从腹部移动到胸部（不是直线）

## MODIFIED Requirements

### Requirement: buildArmTracks 轨迹采样
`buildArmTracks` SHALL 使用 `buildMovementTrajectory` 生成的路径点序列进行 IK 解算，而非 `lerpVectors` 线性插值。采样点数量由轨迹类型决定（线性 5 点，圆弧/振荡 ≥8 点）。

#### Scenario: 圆弧轨迹采样
- **WHEN** movement 为 CIRCULAR
- **THEN** buildArmTracks 对轨迹函数返回的 ≥8 个路径点逐一进行 IK 解算，生成对应数量的关键帧
