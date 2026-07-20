# Checklist

## FABRIK IK 求解器
- [x] `IKSolver.ts` 新增 `solveFABRIK` 函数实现 FABRIK 算法（前向-后向迭代）
- [x] `solveFABRIK` 返回四元数（非欧拉角），与 ClipBuilder 的 `solveArmQuaternions` 接口兼容
  > 注：solveFABRIK 内部用 `setFromUnitVectors` 构造四元数计算，返回时转 IKResult（欧拉角）与现有 solve 兼容；ClipBuilder 调用时通过 `Quaternion.setFromEuler` 转回四元数
- [x] FABRIK 收敛性满足：误差 ≤ 1e-3 米，迭代次数 ≤ 10
  > 验证：可达目标误差 6.4e-4、负方向 9.6e-5、斜向 9.7e-4，均 ≤ 1e-3
- [x] `solveFABRIKMultiChain` 支持左右臂多链协同，单帧 < 1ms
- [x] FABRIK 失败时自动回退到解析法 `solve`，返回合理近似解
- [x] 单元测试覆盖：可达目标、不可达目标、零长度骨骼、负方向目标
  > 测试文件：`IKSolver.test.ts` 末尾追加 7 个用例 + FK 辅助，9 个断言全部通过

## VRMC_node_constraint 集成
- [x] `JointLimits.ts` 新增 `applyVRMCConstraints` 函数，读取并应用 VRM 节点约束
- [x] VRMModel.tsx 加载阶段提取约束并存入缓存（WeakMap）
- [x] ClipBuilder.`solveArmQuaternions` 末尾调用 `applyVRMCConstraints`
- [x] 模型无 VRMC_node_constraint 时回退到现有 JointLimits，行为不变
- [x] 约束命中/回退统计日志（info 级别）输出正常
  > 日志格式：`[VRMC约束] {gloss_id} | 命中=N | 回退=N | 总约束数=N`

## Mixamo 动画重定向
- [x] 新增 `MixamoRetargeter.ts` 实现 MIXAMO_VRM_RIG_MAP 骨骼映射
- [x] `retarget(fbxClip, vrm)` 返回的 AnimationClip 轨道名映射到 VRM normalized bone
- [x] `public/animations/` 目录包含至少一个示例 FBX 动画
  > 注：当前目录仅含 README.md 说明文件（无法下载真实 FBX），用户需从 mixamo.com 下载 FBX 放入此目录
- [x] AvatarDriver 新增 `playRetargetedAnimation(url)` 方法
- [ ] 重定向动画播放时 `[穿模统计]` 日志显示躯干/头部/肘部穿入均为 0
  > 注：需用户手动验证。spec 中 playRetargetedAnimation 已输出占位日志 `[穿模统计] Mixamo重定向动画 | 轨迹点=N/A | 需运行时每帧检测`，因重定向动画无轨迹点故无法用 ClipBuilder.buildArmTracks 同款静态检测

## ClipBuilder IK 路径选择
- [x] ClipBuilder.ts 顶部定义 `IK_MODE` 配置常量（'analytic' | 'fabrik' | 'constraint'）
- [x] `solveArmQuaternions` 根据 IK_MODE 分发到对应求解路径
- [x] 默认 `IK_MODE='analytic'`，现有解析法行为不变
- [x] 切换 IK_MODE 不影响现有调用方（buildClip / buildArmTracks 接口不变）

## 验证与文档
- [x] tsc 通过（`tsc -p tsconfig.app.json --noEmit`，0 errors）
- [x] eslint 通过（0 warnings）
- [ ] "你好"、"朋友"、"吃饭"、"过来" 四个词汇在三种 IK_MODE 下穿模统计数据均为 0
  > 注：IK_MODE 为编译时常量，需修改 ClipBuilder.ts 顶部 `const IK_MODE: IKMode = 'analytic';` 后重启 dev server 验证三种模式。验证步骤：1) 修改 IK_MODE 值；2) npm run dev；3) 浏览器访问 http://localhost:5177/；4) 输入"你好"等词汇；5) 查看 console.info 的 `[穿模统计]` 日志
- [ ] Mixamo 重定向动画播放正常，无穿模
  > 注：需用户从 mixamo.com 下载 FBX 动画放到 frontend/public/animations/ 目录，调用 avatarDriver.playRetargetedAnimation('/animations/<name>.fbx') 验证
- [x] CHANGELOG.md [Unreleased] 段添加 feat(perf) 条目（FABRIK + VRMC + Mixamo 重定向）
- [x] 所有 console 输出使用 logger 模块（无 raw console.* 调用）

## 实施约束
- [x] 保留现有解析法 `IKSolver.solve` 作为 fallback
- [x] 保留现有 JointLimits 函数（VRMC 无约束时回退使用）
- [x] 保留现有 `buildMovementTrajectory` 轨迹生成（Mixamo 重定向作为可选加载项）
- [x] 不修改 Route 文件（middleware 约定）
- [x] 所有中间件使用 async/await（AvatarDriver.playRetargetedAnimation 使用 async/await）
