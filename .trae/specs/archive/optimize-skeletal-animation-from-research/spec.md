# 调研外部项目优化骨骼动作系统 Spec

## Why

当前 signbridge 的骨骼动作系统使用解析法 2-bone IK（余弦定理）+ 手动实现的关节约束，存在以下不足：
1. IK 求解硬编码 BONE_REST_DIR=(0,-1,0) 与肘引导方向，对 A-pose 模型与脊柱前倾场景支持不足；
2. 关节约束（JointLimits.ts）手动实现，未利用 VRM 1.0 内置的 VRMC_node_constraint 规范；
3. 动画全部由参数化轨迹生成（buildMovementTrajectory），无法复用 Mixamo 等真实动作捕捉动画；
4. 表情映射有限，无唇同步（viseme → expression）支持。

通过调研 GitHub 上 5 个相关项目（THREE.IK、MMS-Player、Sign-Kit、DexAvatar、Mixamo+VRM 集成方案），识别出 3 个对当前项目影响最大、最实用的优化方向。

## What Changes

- **新增 FABRIK IK 求解器**：作为 IKSolver.ts 中解析法 `solve` 的替代实现，支持多链协同（双手同时 IK）与多目标约束（手腕 + 肘引导方向）。保留现有解析法作为 fallback。
- **集成 VRMC_node_constraint 规范**：在 VRM 加载阶段读取模型内置约束（roll/aim/rotation），替代部分手动实现的 clampRotationAngle/constrainHingeJoint 调用。保留现有 JointLimits 作为无约束模型的后备。
- **新增 Mixamo 动画重定向**：添加 `MixamoRetargeter.ts`，将 Mixamo FBX 动画的骨骼轨道重映射到 VRM normalized bone，支持加载预录制的手语动作动画。ClipBuilder 保留现有轨迹生成作为主路径，重定向动画作为可选加载项。

## Impact

- Affected specs:
  - `fix-skeleton-penetration-anatomical-limits`（穿透检测逻辑不变，但 IK 求解路径变化需复测）
  - `verify-sentence-demo-completeness`（演示句子的动画质量需复测）
- Affected code:
  - [IKSolver.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/IKSolver.ts) — 新增 FABRIK 实现
  - [ClipBuilder.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/ClipBuilder.ts) — `solveArmQuaternions` 增加可选 FABRIK 路径
  - [JointLimits.ts](file:///d:/G/github/signbridge/frontend/src/modules/avatar/JointLimits.ts) — 新增 VRMC_node_constraint 适配层
  - [VRMModel.tsx](file:///d:/G/github/signbridge/frontend/src/components/avatar/VRMModel.tsx) — VRM 加载阶段读取约束
  - 新增 `MixamoRetargeter.ts` — Mixamo FBX 重定向
  - 新增 `public/animations/` 目录 — 存放预录制 FBX 动画

## ADDED Requirements

### Requirement: FABRIK IK 求解器

系统 SHALL 提供 FABRIK（Forward And Backward Reaching Inverse Kinematics）迭代求解器，作为现有解析法 `IKSolver.solve` 的可选替代。

#### Scenario: FABRIK 求解单臂 IK
- **GIVEN** 肩部世界位置、腕部目标位置、上臂长、前臂长、肘引导方向
- **WHEN** 调用 `solveFABRIK(shoulderPos, wristTarget, upperLen, lowerLen, side, elbowHint, iterations=10)`
- **THEN** 返回肩肘四元数（非欧拉角），误差 ≤ 1e-3 米，迭代次数 ≤ 10

#### Scenario: 多链协同（双手同时 IK）
- **GIVEN** 双手手腕目标位置（如双手胸前对称动作）
- **WHEN** 调用 `solveFABRIKMultiChain({ left: leftTargets, right: rightTargets })`
- **THEN** 左右臂独立求解，无相互干扰，性能不退化（单帧 < 1ms）

#### Scenario: 解析法 fallback
- **GIVEN** FABRIK 求解失败（如目标不可达）
- **WHEN** 调用 IK 求解
- **THEN** 自动回退到解析法 `IKSolver.solve`，返回合理近似解

### Requirement: VRMC_node_constraint 集成

系统 SHALL 在 VRM 加载阶段读取 VRM 1.0 模型内置的 VRMC_node_constraint 约束（roll/aim/rotation），并在 IK 求解后应用约束。

#### Scenario: 模型含 roll 约束（扭转分布）
- **GIVEN** VRM 模型 upperArm 节点含 roll constraint（如扭转 50% 分布到 lowerArm）
- **WHEN** IK 求解完成后应用约束
- **THEN** 上臂旋转按约束比例分布到前臂，避免肘部突变

#### Scenario: 模型无约束规范
- **GIVEN** VRM 模型未导出 VRMC_node_constraint
- **WHEN** 应用约束
- **THEN** 回退到 JointLimits.ts 的手动约束（clampRotationAngle/constrainHingeJoint），行为不变

### Requirement: Mixamo 动画重定向

系统 SHALL 支持加载 Mixamo FBX 动画并重定向到 VRM normalized bone，用于播放预录制的手语动作。

#### Scenario: 加载 Mixamo 单词动画
- **GIVEN** `public/animations/hello.fbx` 是从 Mixamo 导出的手语"你好"动画
- **WHEN** 调用 `MixamoRetargeter.retarget(fbxClip, vrm)`
- **THEN** 返回新的 AnimationClip，轨道名映射到 VRM normalized bone，可直接由 VRMAnimator.playClip 播放

#### Scenario: 重定向后无穿模
- **GIVEN** 重定向后的 AnimationClip
- **WHEN** 在 VRM 模型上播放
- **THEN** 穿模统计日志 `[穿模统计]` 显示躯干穿入=0、头部穿入=0、肘部穿入=0

## MODIFIED Requirements

### Requirement: ClipBuilder IK 路径选择

[Complete modified requirement]

ClipBuilder.`solveArmQuaternions` SHALL 支持通过 `IK_MODE` 配置选择求解路径：
- `'analytic'`（默认）：使用现有解析法，行为不变
- `'fabrik'`：使用 FABRIK 求解器
- `'constraint'`：FABRIK + VRMC_node_constraint 后处理

切换逻辑通过环境变量或运行时配置控制，不破坏现有调用方。

## REMOVED Requirements

（无移除项）

## 调研依据

### 外部项目关键发现

| 项目 | 关键技术 | 对当前项目的启发 |
|------|---------|-----------------|
| [THREE.IK](https://github.com/jsantell/THREE.IK) | FABRIK 迭代求解器、多链多效应器、ball-joint 约束 | 替代解析法，支持多链协同 |
| [MMS-Player](https://www.catalyzex.com/paper/mms-player-an-open-source-software-for) | MultiModal Signstream 格式（并行/时序/屈折） | 长期方向：扩展 GlossSequence（本 spec 不实施） |
| [Sign-Kit](https://github.com/spectre900/Sign-Kit-An-Avatar-based-ISL-Toolkit) | 每词一个 JS 动画文件、Three.js + React | 与本 spec 的 Mixamo 重定向方向一致 |
| [DexAvatar](https://github.com/kaustesseract/DexAvatar) | 从视频重建 3D 手部关节 | 长期方向：动作捕捉数据导入（本 spec 不实施） |
| [Mixamo + VRM 集成](https://gabber.dev/blog/build-a-threejs-3d-avatar-with-realtime-ai-vision-voice-lip-sync-nextjs) | MIXAMO_VRM_RIG_MAP 重定向、AnimationMixer 播放 | 直接借鉴重定向映射表实现 |
| VRMC_node_constraint 规范 | VRM 1.0 内置 roll/aim/rotation 约束 | 替代部分手动约束实现 |

### 当前项目不足对比

| 模块 | 当前实现 | 不足 | 优化方向 |
|------|---------|------|---------|
| IKSolver.ts | 解析法 2-bone IK（余弦定理） | 硬编码 rest dir、单链单目标、返回欧拉角 | FABRIK 迭代求解 |
| JointLimits.ts | 手动实现 clampRotationAngle 等 | 未利用 VRM 1.0 规范约束 | VRMC_node_constraint 适配 |
| ClipBuilder.ts | buildMovementTrajectory 参数化轨迹 | 无法复用真实动作捕捉 | Mixamo 重定向 + FBX 加载 |

## 实施约束

- **保留现有解析法**：FABRIK 作为可选实现，不破坏现有调用路径
- **保留现有 JointLimits**：VRMC_node_constraint 作为优先项，无约束模型回退到 JointLimits
- **保留现有轨迹生成**：Mixamo 重定向作为可选加载项，不强制替换
- **遵循项目约定**：所有 console 输出使用 logger 模块；CHANGELOG.md 同步更新
