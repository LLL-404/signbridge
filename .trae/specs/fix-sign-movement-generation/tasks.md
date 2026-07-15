# Tasks

- [x] Task 1: 新增 `buildMovementTrajectory` 轨迹生成函数
  - 在 ClipBuilder.ts 中新增函数 `buildMovementTrajectory(movement: Movement, startTarget: THREE.Vector3, endTarget: THREE.Vector3, durationSec: number): { time: number; position: THREE.Vector3 }[]`
  - 按 19 种 Movement 枚举生成对应关键帧路径：
    - 线性类（STATIC/UPWARD/DOWNWARD/LEFTWARD/RIGHTWARD/TOWARD_BODY/AWAY_FROM_BODY/FORWARD/HORIZONTAL_LINE/VERTICAL_LINE）：5 点线性
    - 弧线类（UPWARD_ARC/DOWNWARD_ARC）：5 点抛物线，中点 Y 偏移 ±0.15
    - 圆形（CIRCULAR）：8 点圆周，半径 0.15，绕起止中点
    - 之字形（ZIGZAG）：6 点折线，X 方向交替偏移 ±0.1
    - 摆动（WAVE/SIDE_TO_SIDE）：8 点往复振荡，X 方向 2 周期，振幅 0.12
    - 点触（TAP/TAP_TWICE）：TAP=4 点 1 次往返，TAP_TWICE=6 点 2 次往返，Z 方向偏移 0.1
    - 勾连（HOOK_TOGETHER）：5 点向中心汇聚（X→0），Y 渐降
    - 扭转（WAVE_TWIST）：8 点摆动（同 WAVE），额外输出 wristTwist 标志
  - 每个路径点的 time 值在 [0, durationSec] 范围内均匀或按运动特征分布

- [x] Task 2: 重构 `buildArmTracks` 使用轨迹函数
  - 移除 `for (const t of SAMPLE_TIMES)` 循环中的 `lerpVectors(startTarget, endTarget, t)` 调用
  - 改为调用 `buildMovementTrajectory(movement, startTarget, endTarget, durationSec)` 获取路径点序列
  - 对每个路径点调用 `solveArmQuaternions` 进行 IK 解算
  - 轨迹点的时间值用于构建 `times` 数组（而非固定的 SAMPLE_TIMES）
  - 保留现有的 upperRestDir/lowerRestDir 诊断日志

- [x] Task 3: 修改 `buildClip` 移除 movement 条件守卫
  - 移除 `if (locStart === locEnd && m.movement !== Movement.STATIC)` 条件
  - movement 始终传给 buildArmTracks（通过 buildMovementTrajectory）
  - STATIC 时轨迹函数退化为起点=终点的静态路径
  - 保留 locStart !== locEnd 时的起止位置计算

- [x] Task 4: 新增 `applyPalmOrientation` 掌向修正函数
  - 新增函数 `applyPalmOrientation(wristQuat: THREE.Quaternion, orientation: PalmOrientation, side: 'left' | 'right'): THREE.Quaternion`
  - 根据 PalmOrientation 枚举计算绕手腕 Z 轴的旋转修正：
    - INWARD：不额外旋转（IK 默认掌心向内）
    - OUTWARD：绕 Z 旋转 π（掌心翻转）
    - UPWARD：绕 X 旋转 -π/2（掌心朝上）
    - DOWNWARD：绕 X 旋转 π/2（掌心朝下）
    - LEFTWARD/RIGHTWARD：绕 Y 旋转 ±π/2
  - 左右手需镜像处理（左手反转 Y/Z 轴旋转方向）
  - 返回修正后的四元数

- [x] Task 5: 在 buildArmTracks 中集成掌向修正
  - buildArmTracks 增加 `palmOrientation: PalmOrientation` 参数
  - 在 IK 解算得到 wrist 目标后，对 hand bone 轨道叠加掌向旋转
  - 由于当前轨道只有肩+肘，需新增 hand bone（leftHand/rightHand）的 QuaternionKeyframeTrack
  - buildClip 调用 buildArmTracks 时传入 `parsePalmOrientation(m.palm_orientation)`

- [x] Task 6: 在 EnumParser 中新增 parsePalmOrientation
  - 新增 `parsePalmOrientation(value: string): PalmOrientation` 函数
  - 容错处理：非法值回退为 PalmOrientation.INWARD
  - 与现有 parseHandShape/parseHandLocation 风格一致

- [x] Task 7: 同步 AvatarDriver 的 movement 处理
  - AvatarDriver.ts 的 `applyMovementOffset` 与 ClipBuilder 的逻辑统一
  - 或直接移除 AvatarDriver 中的旧 BonePose 管道 movement 处理（如果已弃用）
  - 确保两处不会产生行为分歧

- [x] Task 8: 运行时验证
  - 启动 dev server，输入以下词汇验证动画：
    - "你好"（WAVE 类运动，验证摆动）
    - "朋友"（HOOK_TOGETHER，验证双手汇聚）
    - "谢谢"（UPWARD_ARC 或类似，验证弧线）
  - 确认手腕有可见的非线性运动轨迹
  - 确认掌向修正生效（不同 palm_orientation 产生不同手掌朝向）

# Task Dependencies
- Task 2 依赖 Task 1（需要轨迹函数）
- Task 3 依赖 Task 2（buildArmTracks 重构后才能移除守卫）
- Task 5 依赖 Task 4（需要掌向修正函数）
- Task 8 依赖 Task 1-7 全部完成
- Task 1, 4, 6 可并行
