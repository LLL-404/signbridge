- [x] Checkpoint 1: buildClip 生成的 clip 包含 neck/head 轨道（当 head_movement != none 时）
  - 证据: ClipBuilder.sign-correctness.test.ts "包含 head_movement 的词汇应生成 neck/head 轨道" 通过
- [x] Checkpoint 2: OPEN_5 手形的手指 Y/Z 旋转分量非零（外展角度）
  - 证据: ClipBuilder.sign-correctness.test.ts "OPEN_5 食指 proximal 应有非零 Y 分量" 通过
- [x] Checkpoint 3: solveFABRIK 接受并使用 restDir 参数
  - 证据: IKSolver.test.ts "传入 restDir 应影响求解结果" 通过
- [x] Checkpoint 4: npx vitest run 全部 288 测试通过（270 原有 + 18 新增端到端）
  - 证据: exit code 0, 22 test files, 288 tests
- [x] Checkpoint 5: npx tsc -b 无类型错误
  - 证据: exit code 0
- [x] Checkpoint 6: npx vite build 构建成功
  - 证据: exit code 0, 22.98s
- [x] Checkpoint 7: 所有 20 个 Movement 枚举值在 buildMovementTrajectory 中有对应处理
  - 证据: 代码审查，switch 覆盖全部 20 个值，default 回退到 linear
- [x] Checkpoint 8: 所有 6 个 PalmOrientation 枚举值在 applyPalmOrientation 中有对应处理
  - 证据: 代码审查，switch 覆盖全部 6 个值，default 回退到 identity
- [x] Checkpoint 9: 头部动作轨道验证 — NOD 生成 X 轴旋转，SHAKE 生成 Y 轴旋转，TILT 生成 Z 轴旋转
  - 证据: ClipBuilder.sign-correctness.test.ts 3 个对应测试通过
- [x] Checkpoint 10: 手指外展左右手镜像 — 左手 Y 分量与右手符号相反
  - 证据: ClipBuilder.sign-correctness.test.ts "左手 Y 外展应与右手镜像" 通过
- [x] Checkpoint 11: V_SHAPE 食指和中指外展方向相反
  - 证据: ClipBuilder.sign-correctness.test.ts "V_SHAPE 食指和中指应有相反方向的 Y 外展" 通过
- [x] Checkpoint 12: 双手词汇生成 30 条手指轨道，单手 15 条
  - 证据: ClipBuilder.sign-correctness.test.ts 两个对应测试通过

## 第二轮：解剖学正确性验证（实事求是）

- [x] Checkpoint 13: 解剖学合理性 — 所有骨骼旋转在人体 ROM 内
  - 证据: ClipBuilder.anatomical-correctness.test.ts「解剖学合理性验证」312 测试通过
  - 覆盖: 肩≤180°/肘≤150°/手指 MCP≤90°+25°/PIP≤110°/DIP≤90°/颈部≤50°/头部≤30°
- [x] Checkpoint 14: 运动学可达性 — 手腕目标在臂长范围内
  - 证据: ClipBuilder.anatomical-correctness.test.ts「运动学可达性验证」通过
- [x] Checkpoint 15: 手语语言学不变量 — 真实词汇的关键动作属性
  - 证据: ClipBuilder.anatomical-correctness.test.ts「手语语言学不变量验证」6 个词汇（你好/谢谢/再见/对不起/朋友/不）通过
- [x] Checkpoint 16: 轨迹连续性 — 相邻关键帧旋转变化合理
  - 证据: ClipBuilder.anatomical-correctness.test.ts「轨迹连续性验证」312 测试通过
  - 阈值: 多关键帧轨道 ≤60°，2 关键帧轨道 ≤120°（允许大幅度手形变化）
  - 修复历程: 6 个词汇（没关系/手语/工作/家/学校/书）曾因 IK 分支跳跃失败
    - TAP/TAP_TWICE 离散跳跃 → 改为正弦波平滑过渡
    - wave/wave_twist/tap_twice 的 IK 分支跳跃 → 新增时序平滑后处理（SLERP 插值）
- [x] Checkpoint 17: 四元数有效性 — 无 NaN，单位长度
  - 证据: ClipBuilder.anatomical-correctness.test.ts「四元数有效性验证」312 测试通过
- [x] Checkpoint 18: 全部测试套件通过
  - 证据: npx vitest run 675/675 通过（含 74 真实 VRM 集成 + 312 解剖学正确性 + 289 原有测试）
- [x] Checkpoint 19: TypeScript 编译通过
  - 证据: npx tsc -b exit code 0
- [x] Checkpoint 20: 生产构建通过
  - 证据: npx vite build exit code 0, 25.73s

## 第三轮：真实 VRM 模型端到端验证（实事求是）

- [x] Checkpoint 21: 真实 VRM 模型加载成功
  - 证据: ClipBuilder.real-vrm-integration.test.ts 加载 frontend/public/models/avatar.vrm（10.7MB），VRM 实例包含 humanoid 与 expressionManager
- [x] Checkpoint 22: 真实 VRM 模型包含关键骨骼
  - 证据: 测试验证 hips/spine/chest/neck/head/shoulder/upperArm/lowerArm/hand 等关键骨骼存在
- [x] Checkpoint 23: 真实 VRM 模型包含手指骨骼（≥8 个）
  - 证据: 测试验证 leftHand/rightHand 子树包含 15 个手指关节
- [x] Checkpoint 24: AnimationClip 包含手臂四元数轨道
  - 证据: 测试验证 leftUpperArm/rightUpperArm/leftLowerArm/rightLowerArm QuaternionKeyframeTrack 存在
- [x] Checkpoint 25: 动画播放后手腕世界位置在合理范围内
  - 证据: 12 个词汇 × 5 个采样时间点 × 左右手 = 120 个采样点，全部满足 x∈[-1,1], y∈[0,2], z∈[-0.5,1]
- [x] Checkpoint 26: 动画播放后上臂旋转在解剖学范围内
  - 证据: 12 个词汇 × 采样点，上臂旋转角度 ≤ SHOULDER_ABDUCTION_MAX_RAD + 0.2 容差
- [x] Checkpoint 27: 动画播放后前臂旋转在解剖学范围内
  - 证据: 12 个词汇 × 采样点，前臂旋转角度 ≤ ELBOW_FLEXION_MAX_RAD + 0.3 容差
- [x] Checkpoint 28: 动画播放后肘部不在躯干内部
  - 证据: 12 个词汇 × 3 个采样时间点 × 左右手，肘部水平距离 > 3cm
  - 修复历程: 「他/谢谢/对不起」曾因解析法 IK 上臂方向公式几何错误失败
    - 根因: `dir.applyAxisAngle(elbowDir, -shoulderLift)` 在垂直于 elbowDir 的平面内旋转，结果无 elbowDir 分量
    - 正确公式: `dir*cos(shoulderLift) + elbowDir*sin(shoulderLift)`（肘部在 elbowDir 方向偏移 L1*sin(shoulderLift)）
    - A-pose 下因 dir 与 upperRestDir 同向对称性巧合正确；T-pose 下对称性破坏，upperArmDir X 分量符号反转
- [x] Checkpoint 29: 动画无 NaN 骨骼旋转
  - 证据: 12 个词汇 × 所有骨骼轨道 × 4 个四元数分量，无 NaN
- [x] Checkpoint 30: 全部测试套件通过（含真实 VRM 集成）
  - 证据: npx vitest run 675/675 通过（25 个测试文件）
- [x] Checkpoint 31: TypeScript 编译通过
  - 证据: npx tsc -b exit code 0
- [x] Checkpoint 32: 生产构建通过
  - 证据: npx vite build exit code 0, 25.73s

## 验证局限性诚实声明

以下维度无法在当前测试中程序化验证，需另外手段：
- **实际 VRM 模型渲染视觉效果**: 需浏览器渲染 + 人工目视检查（程序化测试已验证骨骼位置/旋转/穿透，但视觉效果需人工确认）
- **与真人手语 MoCap 数据的相似度**: 需 CSL MoCap 数据集（如 Devisign/CSL-Daily，需签署协议+硬盘邮寄，无法立即获取）
- **手语语言学专家评审**: 需中国手语专家人工评审动作语义正确性
- **与宇树 UnifoLM 等机器人训练数据的对比**: 宇树 UnifoLM-WBT 是 LeRobot 格式（非 BVH），G1 骨架仅 29 DoF（无手指），且非手语动作；G1 Moves（CC-BY-4.0, BVH）可下载但同样非手语。需跨骨架重定向后才能对比，且手语语义无法从机器人训练数据验证