# VRM 人形骨骼与动作系统重建设计

**日期**：2026-07-06
**方案**：A — 直接对接 VRM humanoid 标准，重建骨骼定义、模型驱动与动作生成

---

## 1. 目标与范围

### 1.1 目标
- 以 VRM humanoid 标准（54 骨骼）为唯一真相源，废弃自创 17 关节 BonePose 结构
- position 与 rotation 同时参与 FK 链，骨骼位置由真实前向运动学算出
- IK 反算扩展到全身（肩肘 + 髋膝 + 躯干弯曲），下肢可动
- 动作数据从"起止两点插值"升级为"关键帧序列"，支持圆弧、折线、双手联动
- 移除 BODY_BONE_MAP 翻译层，VRMModel 直接消费新骨骼结构

### 1.2 不在范围内
- 不引入离线动画制作（Mixamo/Blender），动作仍由 SignGloss 数据自动生成
- 不改变 SignGloss 数据 schema（vocabulary.json 保持兼容）
- 不改前端路由与页面交互

---

## 2. 现状问题（重建动机）

| 问题 | 现状文件 | 后果 |
|------|----------|------|
| 骨骼自创 17 关节 | `types/avatar.ts` BonePose | 与 VRM 54 骨骼不匹配，靠 BODY_BONE_MAP 翻译 |
| position 废弃 | `VRMModel.tsx` L240-243 只读 rotation | 骨骼位置不真实 |
| IK 仅肩肘 | `TransitionEngine.ts` applyIKCorrection L251-276 | 下肢/躯干不能动 |
| 起止两点插值 | `AvatarDriver.ts` generateBasicMotion L195-235 | 无法表达真实轨迹 |
| 双手不联动 | `AvatarDriver.ts` 未用 is_two_handed | 双手手语动作缺失 |
| 手形表双份 | `HandShape.ts` + `Skeleton3D.ts` L56-85 | 维护不一致风险 |

---

## 3. 新骨骼结构设计

### 3.1 新 BonePose（直接用 VRM 标准骨骼名）

废弃 `root/left_shoulder/...` 自创命名，新结构直接以 VRM humanoid 骨骼名为 key：

```typescript
// types/avatar.ts（新）

/** VRM humanoid 标准骨骼名（与 VRM 1.0/0.x 规范一致） */
export type VRMBoneName =
  // 躯干
  | 'hips' | 'spine' | 'chest' | 'upperChest' | 'neck' | 'head'
  // 左臂
  | 'leftShoulder' | 'leftUpperArm' | 'leftLowerArm' | 'leftHand'
  // 右臂
  | 'rightShoulder' | 'rightUpperArm' | 'rightLowerArm' | 'rightHand'
  // 左腿
  | 'leftUpperLeg' | 'leftLowerLeg' | 'leftFoot' | 'leftToes'
  // 右腿
  | 'rightUpperLeg' | 'rightLowerLeg' | 'rightFoot' | 'rightToes'
  // 左手手指（5 指 × 3 节）
  | 'leftThumbMetacarpal' | 'leftThumbProximal' | 'leftThumbDistal'
  | 'leftIndexProximal' | 'leftIndexIntermediate' | 'leftIndexDistal'
  | 'leftMiddleProximal' | 'leftMiddleIntermediate' | 'leftMiddleDistal'
  | 'leftRingProximal' | 'leftRingIntermediate' | 'leftRingDistal'
  | 'leftLittleProximal' | 'leftLittleIntermediate' | 'leftLittleDistal'
  // 右手手指（同左）
  | 'rightThumbMetacarpal' | 'rightThumbProximal' | 'rightThumbDistal'
  | 'rightIndexProximal' | 'rightIndexIntermediate' | 'rightIndexDistal'
  | 'rightMiddleProximal' | 'rightMiddleIntermediate' | 'rightMiddleDistal'
  | 'rightRingProximal' | 'rightRingIntermediate' | 'rightRingDistal'
  | 'rightLittleProximal' | 'rightLittleIntermediate' | 'rightLittleDistal';

/** 单个骨骼的姿态：rotation 为主，position 仅 hips/手部末端用 */
export interface BoneTransform {
  rotation: Vec3;      // 欧拉角弧度，FK 链核心
  position?: Vec3;     // 可选，仅 hips（根位移）和 leftHand/rightHand（IK 目标）使用
}

/** 一帧完整姿态 = VRM 骨骼名 → 变换 */
export interface VRMPose {
  bones: Partial<Record<VRMBoneName, BoneTransform>>;
  expression?: FacialExpression;
  headMovement?: HeadMovement;
  /** IK 目标（可选，指定后覆盖 FK 结果） */
  ikTargets?: {
    leftHand?: Vec3;    // 左手世界坐标目标
    rightHand?: Vec3;   // 右手世界坐标目标
    leftFoot?: Vec3;
    rightFoot?: Vec3;
  };
}

export interface Frame {
  pose: VRMPose;
  timestamp: number;
}
```

### 3.2 NEUTRAL_POSE 重写

不再用绝对世界坐标摆关节，改为只设 hips 根位置 + 各关节零旋转（VRM T-pose 即为 rest pose）：

```typescript
export const NEUTRAL_POSE: VRMPose = {
  bones: {
    hips: { rotation: {x:0,y:0,z:0}, position: {x:0,y:1.0,z:0} },
    // 其余骨骼零旋转 = T-pose 自然站姿
  },
  expression: FacialExpression.NEUTRAL,
  headMovement: HeadMovement.NONE,
};
```

### 3.3 移除 BODY_BONE_MAP 翻译层

VRMModel 直接用 VRMBoneName 访问 `vrm.humanoid.getBoneNode(name)`，不再翻译。

---

## 4. 动作系统重构

### 4.1 关键帧序列（替代起止两点插值）

```typescript
// modules/avatar/AvatarDriver.ts（新）

/** 单个关键帧：时间点 + 该时刻若干骨骼的目标姿态 */
export interface Keyframe {
  time: number;  // 0~1 归一化时间
  bones: Partial<Record<VRMBoneName, BoneTransform>>;
  handShapes?: { left?: HandShape; right?: HandShape };
  ikTargets?: VRMPose['ikTargets'];
}

/** 一个词汇的动作 = 关键帧序列 */
export interface SignMotion {
  gloss_id: string;
  keyframes: Keyframe[];
  duration_ms: number;
  loop: boolean;
}
```

播放时：对相邻关键帧做 slerp 插值生成每帧 VRMPose，再交给渲染层。

### 4.2 SignGloss → Keyframes 转换器

`generateMotion(gloss: SignGloss): SignMotion` 根据 manual 字段生成关键帧：

- **静态词**（movement=static）：2 帧（起手形 @ location_start → 结束手形 @ location_start）
- **直线运动**（upward/downward/...）：3 帧（起 → 中间直线位移 → 终）
- **弧线运动**（upward_arc/downward_arc/circular）：5 帧（起 → 1/4 弧 → 顶点 → 3/4 弧 → 终），按帧采样弧线轨迹作为 IK 目标
- **折线运动**（zigzag）：5 帧（起 → 抖1 → 中 → 抖2 → 终）
- **双手动作**（is_two_handed=true）：副手镜像生成关键帧，与主导手同步

### 4.3 IK 扩展到全身

新建 `IKSolver` 模块，支持：
- 上肢链：shoulder → upperArm → lowerArm → hand（已有）
- 下肢链：upperLeg → lowerLeg → foot（新增）
- 躯干弯曲：spine → chest → upperChest 三段前倾/侧弯（新增）

IK 目标来自 `VRMPose.ikTargets`，反算结果覆盖对应骨骼 rotation。

### 4.4 手形表统一

废弃 Skeleton3D 的 HAND_SHAPE_ANGLES 表，统一用 `HandShape.ts` 的 `HAND_SHAPE_DEFINITIONS`。新增 `handShapeToBoneRotations(shape): Partial<Record<VRMBoneName, Vec3>>` 直接返回 VRM 手指骨骼旋转。

---

## 5. 渲染层改造

### 5.1 VRMModel.tsx

- 移除 BODY_BONE_MAP、FINGER_BONE_MAP
- `useFrame` 直接遍历 `pose.bones`，按 VRMBoneName 取 `vrm.humanoid.getBoneNode(name)` 写 rotation
- 手指：从 `handShapeToBoneRotations` 取旋转写入 15 个手指骨骼
- IK 目标：若 `pose.ikTargets` 存在，调用 IKSolver 反算后覆盖对应骨骼 rotation
- 保留 Retargeter（T-pose↔A-pose 校正）和 BoneSmoother（One-Euro 滤波）

### 5.2 Skeleton3D（线框调试视图）

保留但改为消费 VRMPose（同样用 VRMBoneName），与 VRMModel 共用同一套骨骼结构。可作为调试 fallback。

### 5.3 Avatar3D

无需大改，仍作为 Canvas 容器，向下传 VRMPose。

---

## 6. 数据流

```
SignGloss (vocabulary.json)
  ↓
AvatarDriver.generateMotion(gloss) → SignMotion (关键帧序列)
  ↓
MotionPlayer 按时间插值 → VRMPose (每帧)
  ↓
VRMModel.useFrame
  ├─ 遍历 pose.bones → vrm.humanoid.getBoneNode(name).rotation
  ├─ handShapeToBoneRotations → 手指骨骼
  ├─ IKSolver.solve(ikTargets) → 覆盖肩肘/髋膝 rotation
  ├─ Retargeter.retarget → T-pose↔A-pose 校正
  └─ BoneSmoother.smooth → 抖动滤波
  ↓
VRM 渲染
```

---

## 7. 兼容性与迁移

### 7.1 词汇库兼容
vocabulary.json 的 SignGloss schema 不变，`generateMotion` 内部适配新关键帧格式。

### 7.2 MotionDataStore 兼容
旧 MotionData（Frame[] 起止插值格式）需迁移为新 SignMotion（Keyframe[]）。提供 `migrateLegacyMotion` 适配函数，旧数据按"起=KF0, 终=KF1"转换。

### 7.3 过渡期双轨
- 新增 `VRMPose` 类型，旧 `BonePose` 标 `@deprecated` 但保留
- AvatarDriver 新增 `generateMotion` 返回 SignMotion，旧 `generateBasicMotion` 保留供回退
- VRMModel 优先消费 VRMPose，若收到旧 BonePose 走旧路径

---

## 8. 测试策略

- **单元测试**：generateMotion 对各类 movement 生成正确帧数；IKSolver 反算误差 < 0.01rad
- **渲染验证**：构建后人工检查 VRM 模型各动作（圆弧、双手、下肢弯曲）表现正确
- **回归测试**：765 词全量生成 SignMotion 无异常；旧词汇动作表现不退化

---

## 9. 风险

| 风险 | 缓解 |
|------|------|
| VRM 0.x 与 1.0 骨骼名差异 | 当前 AvatarSample_A 是 0.x，骨骼名已验证匹配；统一用 VRM 0.x 命名 |
| IK 反算不稳定（抖动） | BoneSmoother 已有 One-Euro 滤波；IK 加迭代上限和阻尼 |
| 改动量大导致回归 | 双轨过渡期 + 旧路径保留，分阶段切换 |

---

## 10. 交付物

1. `types/avatar.ts`：新增 VRMBoneName、VRMPose、Keyframe、SignMotion 类型
2. `modules/avatar/AvatarDriver.ts`：新增 generateMotion、关键帧生成器
3. `modules/avatar/IKSolver.ts`：全身 IK 反算（新文件）
4. `modules/avatar/HandShape.ts`：新增 handShapeToBoneRotations
5. `components/avatar/VRMModel.tsx`：改用 VRMPose 驱动，移除 BODY_BONE_MAP
6. `modules/avatar/skeleton/Skeleton3D.ts`：改用 VRMPose
7. 旧 BonePose / generateBasicMotion 标 deprecated 保留
