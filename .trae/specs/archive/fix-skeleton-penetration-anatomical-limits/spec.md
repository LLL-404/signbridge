# 骨骼穿模与解剖学关节限制修复 Spec

## Why
用户反馈手语动画骨骼穿模严重。经实事求是调查，现有方案存在真实缺陷，并非已修复：
1. **零碰撞检测**：代码库中无任何 collision/碰撞/穿模/clipping 实现（grep 返回空），模型没有碰撞体积，手臂可自由穿过躯干、头部、另一只手臂。
2. **目标点可在身体内部**：`buildMovementTrajectory` 直接用 start/end 目标点生成轨迹，TAP 的 contact 点 `startTarget+(0,0,0.1)`、CIRCULAR 圆心在身体中线，均无穿入躯干/头部的校验；IK 仍把手腕送进躯干。
3. **IK 只约束角度不约束位置**：`solveArmQuaternions` 肩 170°/肘 150° 限制满足时，肘部仍被弯到极限让前臂穿入躯干；肘引导方向硬编码 `(sideBias,-1,0.6)`，A-pose 时 sideBias≈0 易失效。
4. **关节限制值非解剖学**：肩各方向统一 170°（人体外展~120°/前屈~180°/后伸~60°），肘无旋前旋后限制，前臂可扭曲穿入上臂。
5. **前 spec 未真正验证**：`fix-sign-clipping-root-cause` 的运行时验证任务标记为 `[~]` 待验证，从未实际运行——这是用户「糊弄」指责的直接原因。

本 spec 引入轻量身体包络体（非完整物理引擎）+ 目标点合法性约束 + 肘部穿透修正 + 解剖学关节限制，与现有 AnimationMixer 关键帧管线兼容（clip 构建时一次性计算，不每帧物理求解），并以**运行时验证**为强制验收标准。

## What Changes
- 新增 `BodyVolume` 模块：用简单几何体描述身体包络——躯干=胶囊体（由肩宽/胸厚/躯干高度构建）、头部=球、上臂/前臂=胶囊体，尺寸从 VRM normalized bone 实际位置推导，不硬编码。
- `ClipBuilder.buildMovementTrajectory` 后新增**目标点合法性约束**：对每个轨迹点检测是否穿入躯干/头部包络，穿入则沿最近法线投影到包络表面。
- `solveArmQuaternions` 后新增**肘部穿透修正**：检测肘位置是否穿入躯干包络，穿入则将肘沿外法线推到表面并重算前臂方向；肘引导方向从硬编码改为基于 shoulder→hips 向量的动态推导，适配 A-pose。
- `JointLimits` 增强：肩关节按运动方向分别限制（外展 120°/前屈 180°/后伸 60°，从四元数分解主旋转方向）；肘关节在 150° 屈曲基础上增加旋前旋后限制（±80°），防止前臂轴向扭曲穿入上臂。
- **不引入物理引擎**：所有约束在 clip 构建阶段（离线）一次性计算，写入关键帧，运行时仍由 AnimationMixer 插值播放，零运行时开销。

## Impact
- Affected specs: fix-sign-clipping-root-cause（运行时验证 [~] 未完成，本 spec 接管）、fix-ik-joint-limits（关节限制值将被替换为解剖学数值）、fix-sign-movement-generation（轨迹生成后新增合法性约束环节）
- Affected code:
  - `frontend/src/modules/avatar/ClipBuilder.ts`（buildMovementTrajectory 后加合法性约束、solveArmQuaternions 后加肘部修正、buildArmTracks 接入 BodyVolume）
  - `frontend/src/modules/avatar/JointLimits.ts`（肩关节分方向限制函数、肘关节旋前旋后限制）
  - 新增 `frontend/src/modules/avatar/BodyVolume.ts`（身体包络体构建与穿透检测）
- 不受影响：VRMModel.tsx、VRMAnimator.ts、GlossMapper.ts、实时姿态路径（RealtimePoseDriver/KalidokitSolver，本 spec 聚焦离线手语播放）

## ADDED Requirements

### Requirement: 身体包络体 BodyVolume
系统 SHALL 提供一个 BodyVolume 模块，从 VRM normalized bone 实际位置推导身体包络，包含：
- 躯干胶囊体：以 spine→chest→neck 骨骼链为中轴，半径=肩宽×0.45，高度=hips 到 neck 距离
- 头部球：中心=头部骨骼世界位置，半径=头骨长度×0.6
- 上臂/前臂胶囊体：以对应骨骼两端为轴线，半径=骨骼长度×0.12

#### Scenario: 包络体从模型实际尺寸构建
- **WHEN** VRM 加载完成后构建 BodyVolume
- **THEN** 躯干胶囊半径与模型肩宽成比例，头部球中心对齐头部骨骼
- **AND** 不依赖任何硬编码数值，不同 VRM 模型自动适配

### Requirement: 轨迹目标点合法性约束
系统 SHALL 在 buildMovementTrajectory 生成轨迹后、IK 解算前，对每个轨迹点做穿透检测：
- 检测点是否在躯干胶囊或头部球内
- 若在内，沿最近外法线投影到包络表面（保留点的切向分量，仅推出穿透深度）
- TAP 类运动的 contact 点必须经过合法性约束，防止点触目标在躯干内

#### Scenario: 目标点穿入躯干被投影到表面
- **WHEN** 某词条 location_start=chest_center，生成轨迹点位于躯干胶囊内部
- **THEN** 该点被沿 X 轴（躯干外法线）投影到胶囊表面
- **AND** IK 解算的手腕目标位于身体外，手腕不穿入躯干

### Requirement: 肘部穿透修正
系统 SHALL 在 solveArmQuaternions 返回后，检测肘部位置是否穿入躯干包络：
- 若穿入，将肘沿躯干外法线推到表面，重算前臂方向与肘部四元数
- 肘引导方向从硬编码 `(sideBias,-1,0.6)` 改为基于 `shoulder→hips` 向量的动态推导，适配 A-pose（upperRestDir.x≈0 时 sideBias 退化）

#### Scenario: 肘部穿入躯干被推出
- **WHEN** IK 解算后肘位置位于躯干胶囊内（如手部指向对侧肩部时）
- **THEN** 肘被沿外法线推到躯干表面
- **AND** 前臂方向从修正后的肘位置重新计算
- **AND** 视觉上肘部不穿入躯干

### Requirement: 解剖学关节限制
系统 SHALL 将关节限制值替换为基于人体测量学的数值，并按运动方向分别约束：
- 肩关节：外展（abduction）≤120°、前屈（flexion）≤180°、后伸（extension）≤60°；从 upperQuat 相对 rest pose 的旋转分解主方向后分别钳制
- 肘关节：屈曲 0°-150°（保持），新增旋前/旋后（前臂轴向旋转）≤±80°
- 限制值定义在 JointLimits 常量中，附注释标注数据来源（人体测量学常用值）

#### Scenario: 肩关节后伸超限被钳制
- **WHEN** upperQuat 旋转使上臂后伸超过 60°
- **THEN** 旋转被钳制到 60°，手臂不过度后摆穿入躯干后侧

#### Scenario: 前臂旋前超限被钳制
- **WHEN** lowerQuat 包含超过 80° 的轴向旋转（旋前/旋后）
- **THEN** 轴向分量被钳制到 ±80°，前臂不扭曲穿入上臂

### Requirement: 强制运行时验证
本 spec 的所有验收必须包含**真实运行时观察**，不得仅以代码逻辑分析作为通过依据。

#### Scenario: 运行时无穿模
- **WHEN** 在浏览器输入「你好」「朋友」「吃饭」「过来」播放手语
- **THEN** 虚拟人手臂动作中肘部不穿入躯干、手腕不穿入躯干或头部、前臂不扭曲穿入上臂
- **AND** 截图记录每个词条的动作姿态作为证据

## MODIFIED Requirements

### Requirement: 关节限制系统
JointLimits 从「单一角度钳制」升级为「解剖学方向限制」：肩关节分外展/前屈/后伸三方向，肘关节增加旋前旋后轴向限制。限制值基于人体测量学常用数据，而非粗略的统一 170°/150°。

### Requirement: 运动轨迹生成
buildMovementTrajectory 生成的轨迹点在送入 IK 解算前，必须经过 BodyVolume 合法性约束，确保目标点不在身体包络内部。

## REMOVED Requirements
无
