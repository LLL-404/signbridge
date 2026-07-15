# Checklist

## FABRIK IK 求解器
- [ ] `IKSolver.ts` 新增 `solveFABRIK` 函数实现 FABRIK 算法（前向-后向迭代）
- [ ] `solveFABRIK` 返回四元数（非欧拉角），与 ClipBuilder 的 `solveArmQuaternions` 接口兼容
- [ ] FABRIK 收敛性满足：误差 ≤ 1e-3 米，迭代次数 ≤ 10
- [ ] `solveFABRIKMultiChain` 支持左右臂多链协同，单帧 < 1ms
- [ ] FABRIK 失败时自动回退到解析法 `solve`，返回合理近似解
- [ ] 单元测试覆盖：可达目标、不可达目标、零长度骨骼、负方向目标

## VRMC_node_constraint 集成
- [ ] `JointLimits.ts` 新增 `applyVRMCConstraints` 函数，读取并应用 VRM 节点约束
- [ ] VRMModel.tsx 加载阶段提取约束并存入缓存（WeakMap）
- [ ] ClipBuilder.`solveArmQuaternions` 末尾调用 `applyVRMCConstraints`
- [ ] 模型无 VRMC_node_constraint 时回退到现有 JointLimits，行为不变
- [ ] 约束命中/回退统计日志（info 级别）输出正常

## Mixamo 动画重定向
- [ ] 新增 `MixamoRetargeter.ts` 实现 MIXAMO_VRM_RIG_MAP 骨骼映射
- [ ] `retarget(fbxClip, vrm)` 返回的 AnimationClip 轨道名映射到 VRM normalized bone
- [ ] `public/animations/` 目录包含至少一个示例 FBX 动画
- [ ] AvatarDriver 新增 `playRetargetedAnimation(url)` 方法
- [ ] 重定向动画播放时 `[穿模统计]` 日志显示躯干/头部/肘部穿入均为 0

## ClipBuilder IK 路径选择
- [ ] ClipBuilder.ts 顶部定义 `IK_MODE` 配置常量（'analytic' | 'fabrik' | 'constraint'）
- [ ] `solveArmQuaternions` 根据 IK_MODE 分发到对应求解路径
- [ ] 默认 `IK_MODE='analytic'`，现有解析法行为不变
- [ ] 切换 IK_MODE 不影响现有调用方（buildClip / buildArmTracks 接口不变）

## 验证与文档
- [ ] tsc 通过（`tsc -p tsconfig.app.json --noEmit`，0 errors）
- [ ] eslint 通过（0 warnings）
- [ ] "你好"、"朋友"、"吃饭"、"过来" 四个词汇在三种 IK_MODE 下穿模统计数据均为 0
- [ ] Mixamo 重定向动画播放正常，无穿模
- [ ] CHANGELOG.md [Unreleased] 段添加 feat(perf) 条目（FABRIK + VRMC + Mixamo 重定向）
- [ ] 所有 console 输出使用 logger 模块（无 raw console.* 调用）

## 实施约束
- [ ] 保留现有解析法 `IKSolver.solve` 作为 fallback
- [ ] 保留现有 JointLimits 函数（VRMC 无约束时回退使用）
- [ ] 保留现有 `buildMovementTrajectory` 轨迹生成（Mixamo 重定向作为可选加载项）
- [ ] 不修改 Route 文件（middleware 约定）
- [ ] 所有中间件使用 async/await
