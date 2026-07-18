# 骨骼动作正确表示手语动作 - 产品需求文档

## Overview
- **Summary**: 修复 SignBridge 骨骼动画系统中阻止正确表示手语动作的关键缺陷，确保 VRM 虚拟人能准确表达手语词汇的手形、运动轨迹、头部动作和非手语标记。
- **Purpose**: 解决"静态骨骼定义 vs 动态手语表达"的主要矛盾，使骨骼动作能够正确表示手语动作。
- **Target Users**: 手语桥的所有用户（听障人士、健听人学习者、公共服务机构）。

## Goals
- VRM 模式下头部动作（nod/shake/tilt/slight_bow）能正确驱动 VRM 颈部/头部骨骼
- 手指骨骼支持 Y/Z 轴旋转（外展/内收），使手形更精确
- 确保所有 Movement 枚举值在 ClipBuilder 中都有对应轨迹生成
- FABRIK IK 模式下使用实际骨骼 rest direction 而非硬编码值

## Non-Goals (Out of Scope)
- 不重构整个动画系统架构
- 不添加新的手语词汇
- 不修改词汇数据格式
- 不处理实时姿态追踪路径的问题

## Background & Context

### 矛盾分析
- **主要矛盾**: [手形/动作定义的静态性] vs [手语表达的动态连续性]
- **性质**: 非对抗性（技术矛盾，需调查研究+实践验证）
- **应对方法**: 调查研究（定位代码缺陷）→ 实践验证（修复+测试）

### 已识别的关键缺陷
1. **头部动作丢失**: ClipBuilder.buildClip() 不生成头部骨骼轨道，VRM 模式下 head_movement 完全无效
2. **手指外展缺失**: handShapeToBoneRotations 仅设置 X 轴旋转（屈曲），Y/Z 轴恒为 0，手指无法外展
3. **身体动作未实现**: SignGloss.non_manual.body_movement 字段存在但无代码处理
4. **FABRIK rest direction 硬编码**: solveFABRIK 内部使用 BONE_REST_DIR=(0,-1,0)，与 VRM 实际 rest direction 不匹配

## Functional Requirements
- **FR-1**: ClipBuilder 生成头部动作轨道（neck/head 骨骼的 QuaternionKeyframeTrack）
- **FR-2**: HandShape 定义增加手指外展角度（Y/Z 轴旋转），handShapeToBoneRotations 应用完整三轴旋转
- **FR-3**: solveFABRIK 接受 upperRestDir/lowerRestDir 参数，不再硬编码 BONE_REST_DIR

## Non-Functional Requirements
- **NFR-1**: 修改不破坏现有 269 个单元测试
- **NFR-2**: 动画生成性能不显著退化（单 clip 生成 < 50ms）
- **NFR-3**: 代码修改遵循现有架构（ClipBuilder 静态方法风格）

## Constraints
- **Technical**: 基于 Three.js AnimationMixer + VRM normalized bone API
- **Business**: 不影响参赛 Demo 的展示效果
- **Dependencies**: VRM 模型的 humanoid 骨骼必须包含 neck/head 节点

## Acceptance Criteria

### AC-1: 头部动作轨道生成
- **Given**: 词汇数据包含 head_movement（如 nod/shake/tilt/slight_bow）
- **When**: ClipBuilder.buildClip() 生成 AnimationClip
- **Then**: clip 中包含 neck 和/或 head 骨骼的 QuaternionKeyframeTrack
- **Verification**: `programmatic` - 检查 clip.tracks 中存在名称包含 'neck' 或 'head' 的轨道

### AC-2: 手指三轴旋转
- **Given**: HandShape 定义包含 Y/Z 轴外展角度
- **When**: handShapeToBoneRotations 和 buildFingerTracks 生成手指轨道
- **Then**: 手指骨骼旋转包含非零 Y/Z 分量（对于需要外展的手形）
- **Verification**: `programmatic` - 检查生成的四元数 Y/Z 分量不为零

### AC-3: FABRIK 使用实际 rest direction
- **Given**: IK_MODE 设置为 'fabrik'
- **When**: ClipBuilder 调用 solveFABRIK
- **Then**: solveFABRIK 使用传入的 upperRestDir/lowerRestDir 而非硬编码 (0,-1,0)
- **Verification**: `programmatic` - solveFABRIK 接受并使用 rest direction 参数

### AC-4: 现有功能不回归
- **Given**: 现有 269 个单元测试通过
- **When**: 实施修复后
- **Then**: 所有测试仍通过
- **Verification**: `programmatic` - npx vitest run 全部通过
