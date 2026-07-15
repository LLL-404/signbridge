# Tasks

## 调研阶段（已完成）

- [x] Task 0: 调研 GitHub 上的骨骼动作系统与手语虚拟人项目
  - [x] SubTask 0.1: 调研 THREE.IK（FABRIK 求解器、多链多效应器）
  - [x] SubTask 0.2: 调研 MMS-Player（MMS 格式、Blender+Python）
  - [x] SubTask 0.3: 调研 Sign-Kit（印度手语、Three.js + React）
  - [x] SubTask 0.4: 调研 DexAvatar（3D 手语重建、视频驱动）
  - [x] SubTask 0.5: 调研 Mixamo + VRM 集成方案（重定向映射表）
  - [x] SubTask 0.6: 读取当前项目 IKSolver.ts / JointLimits.ts / ClipBuilder.ts 作为对比基线

## 实施阶段

- [x] Task 1: 实现 FABRIK IK 求解器
  - [x] SubTask 1.1: 在 `IKSolver.ts` 新增 `solveFABRIK` 函数，实现 FABRIK 前向-后向迭代算法
  - [x] SubTask 1.2: 新增 `solveFABRIKMultiChain` 函数，支持左右臂多链协同求解
  - [x] SubTask 1.3: 添加 fallback 逻辑：FABRIK 失败时回退到解析法 `solve`
  - [x] SubTask 1.4: 编写单元测试验证 FABRIK 收敛性（误差 ≤ 1e-3 米，迭代 ≤ 10 次）

- [ ] Task 2: 集成 VRMC_node_constraint 规范
  - [ ] SubTask 2.1: 在 `JointLimits.ts` 新增 `applyVRMCConstraints` 函数，读取 VRM 节点的 roll/aim/rotation 约束
  - [ ] SubTask 2.2: 在 VRMModel.tsx 加载阶段提取约束并存入缓存（WeakMap<VRM, NodeConstraintMap>）
  - [ ] SubTask 2.3: 在 ClipBuilder.ts 的 `solveArmQuaternions` 末尾调用 `applyVRMCConstraints`，无约束时回退到现有 JointLimits
  - [ ] SubTask 2.4: 添加日志：约束命中/回退统计（info 级别，便于数据级验证）

- [x] Task 3: 实现 Mixamo 动画重定向
  - [x] SubTask 3.1: 新增 `MixamoRetargeter.ts`，定义 MIXAMO_VRM_RIG_MAP 骨骼映射表
  - [x] SubTask 3.2: 实现 `retarget(fbxClip, vrm): AnimationClip` 函数，重映射轨道名到 VRM normalized bone
  - [x] SubTask 3.3: 在 `public/animations/` 添加示例 FBX 动画（如 `wave.fbx`）作为测试素材
  - [x] SubTask 3.4: 在 AvatarDriver 添加 `playRetargetedAnimation(url)` 方法，支持加载远程 FBX 并播放
  - [x] SubTask 3.5: 添加穿模检测：重定向动画播放时输出 `[穿模统计]` 日志

- [ ] Task 4: ClipBuilder IK 路径选择
  - [ ] SubTask 4.1: 在 ClipBuilder.ts 顶部添加 `IK_MODE` 配置常量（'analytic' | 'fabrik' | 'constraint'）
  - [ ] SubTask 4.2: 修改 `solveArmQuaternions`，根据 IK_MODE 分发到对应求解路径
  - [ ] SubTask 4.3: 默认 IK_MODE='analytic'，确保现有行为不变

- [ ] Task 5: 验证与文档
  - [ ] SubTask 5.1: 运行 tsc 与 eslint，确保 0 errors/warnings
  - [ ] SubTask 5.2: 在浏览器中验证 "你好"、"朋友"、"吃饭"、"过来" 四个词汇在三种 IK_MODE 下的穿模统计数据（躯干/头部/肘部穿入均为 0）
  - [ ] SubTask 5.3: 验证 Mixamo 重定向动画播放正常，无穿模
  - [ ] SubTask 5.4: 更新 CHANGELOG.md 的 [Unreleased] 段，添加 feat(perf) 条目

# Task Dependencies

- Task 2 依赖 Task 1（VRMC 约束应用在 IK 求解结果上）
- Task 4 依赖 Task 1 + Task 2（IK_MODE 分发需要 FABRIK 与约束都已实现）
- Task 3 与 Task 1/2/4 并行（独立模块）
- Task 5 依赖 Task 1 + Task 2 + Task 3 + Task 4 全部完成
