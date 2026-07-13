// ClipBuilder：从 SignGloss 生成 THREE.AnimationClip
// 内部调用 IKSolver.solve() 计算肩肘旋转，生成关键帧轨道
// 替代旧的"每帧手动设置 node.quaternion"方案，改用 AnimationMixer 驱动
//
// 骨骼节点选取：使用 humanoid.getNormalizedBoneNode(...)（normalized bone API）。
// 原因：VRM 的 autoUpdateHumanBones 默认为 true，VRM.update() 会把 normalized bone
// 同步到 raw bone。若 AnimationMixer 直接操作 raw bone 节点，其修改会被 vrm.update()
// 覆盖（normalized bone 未被修改仍是 identity），导致模型不动。改用 normalized bone
// 后，AnimationMixer 操作 normalized bone，vrm.update() 会正确同步到 raw bone。
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import type { SignGloss } from '@/types/sign';
import { HandLocation, HandShape, FacialExpression, Movement } from '@/types/sign';
import type { Vec3 } from '@/types/avatar';
import { getHandShapeDefinition } from './HandShape';
import { clampRotationAngle, computeHingeAxis, constrainHingeJoint } from './JointLimits';
import { logger } from '@/modules/debug/logger';

const log = logger.module('ClipBuilder');

// ===== 标准人体比例（与 AvatarDriver VRM_LOCATION_OFFSETS 一致）=====
const STANDARD_SHOULDER_Y = 0.50;
const STANDARD_HEAD_TOP_Y = 0.80;
const STANDARD_SHOULDER_HALF_WIDTH = 0.22;

/** 默认动作时长（毫秒） */
const DEFAULT_DURATION_MS = 1000;

/** 5 个采样点的时间比例（0%, 25%, 50%, 75%, 100%） */
const SAMPLE_TIMES = [0, 0.25, 0.5, 0.75, 1.0] as const;

/** 上方向单位向量，用于计算肘部铰链轴 */
const UP = new THREE.Vector3(0, 1, 0);

/**
 * HandLocation → 相对 hips 的偏移（scene 本地坐标系，单位：米，标准人体比例）
 * Z 表示前方偏移，值需足够大以防止手腕穿入躯干
 */
const LOCATION_OFFSETS: Record<HandLocation, Vec3> = {
  [HandLocation.NEUTRAL]:        { x: 0,     y: -0.10, z: 0.18 },
  [HandLocation.WAIST_LEVEL]:    { x: 0,     y: 0.10,  z: 0.20 },
  [HandLocation.ABDOMEN_LEVEL]:  { x: 0,     y: 0.20,  z: 0.25 },
  [HandLocation.CHEST_CENTER]:   { x: 0,     y: 0.35,  z: 0.25 },
  [HandLocation.CHEST_LEFT]:     { x: -0.18, y: 0.35,  z: 0.25 },
  [HandLocation.CHEST_RIGHT]:    { x: 0.18,  y: 0.35,  z: 0.25 },
  [HandLocation.SHOULDER_LEFT]:  { x: -0.22, y: 0.50,  z: 0.12 },
  [HandLocation.SHOULDER_RIGHT]: { x: 0.22,  y: 0.50,  z: 0.12 },
  [HandLocation.CHIN_LEVEL]:     { x: 0,     y: 0.55,  z: 0.25 },
  [HandLocation.MOUTH_LEVEL]:    { x: 0,     y: 0.60,  z: 0.26 },
  [HandLocation.FACE_LEVEL]:     { x: 0,     y: 0.63,  z: 0.28 },
  [HandLocation.EYE_LEVEL]:      { x: 0,     y: 0.66,  z: 0.26 },
  [HandLocation.FOREHEAD_LEVEL]: { x: 0,     y: 0.70,  z: 0.22 },
};

/** 表情映射：FacialExpression → VRM expression preset */
const EXPRESSION_MAP: Record<string, string> = {
  [FacialExpression.NEUTRAL]: 'neutral',
  [FacialExpression.HAPPY]: 'happy',
  [FacialExpression.SAD]: 'sad',
  [FacialExpression.ANGRY]: 'angry',
  [FacialExpression.SURPRISED]: 'surprised',
  [FacialExpression.CONFUSED]: 'sad',
  [FacialExpression.QUESTION]: 'surprised',
  [FacialExpression.NEGATIVE]: 'angry',
  [FacialExpression.EMPHASIS]: 'angry',
};

/**
 * 手指骨骼名（单手 15 个）
 * 顺序与 HandShapeDefinition.fingers 一致：[拇指, 食指, 中指, 无名指, 小指]
 * 每根手指 3 个关节：mcp / pip / dip
 * 拇指：Metacarpal / Proximal / Distal（无 PIP，3 节）
 * 其他指：Proximal / Intermediate / Distal（3 节）
 */
interface FingerJointMap {
  vrm: string;
  fingerIndex: number;
  joint: 'mcp' | 'pip' | 'dip';
}

const FINGER_BONE_NAMES: ReadonlyArray<FingerJointMap> = [
  { vrm: 'ThumbMetacarpal',    fingerIndex: 0, joint: 'mcp' },
  { vrm: 'ThumbProximal',      fingerIndex: 0, joint: 'pip' },
  { vrm: 'ThumbDistal',        fingerIndex: 0, joint: 'dip' },
  { vrm: 'IndexProximal',      fingerIndex: 1, joint: 'mcp' },
  { vrm: 'IndexIntermediate',  fingerIndex: 1, joint: 'pip' },
  { vrm: 'IndexDistal',        fingerIndex: 1, joint: 'dip' },
  { vrm: 'MiddleProximal',     fingerIndex: 2, joint: 'mcp' },
  { vrm: 'MiddleIntermediate', fingerIndex: 2, joint: 'pip' },
  { vrm: 'MiddleDistal',       fingerIndex: 2, joint: 'dip' },
  { vrm: 'RingProximal',       fingerIndex: 3, joint: 'mcp' },
  { vrm: 'RingIntermediate',   fingerIndex: 3, joint: 'pip' },
  { vrm: 'RingDistal',         fingerIndex: 3, joint: 'dip' },
  { vrm: 'LittleProximal',     fingerIndex: 4, joint: 'mcp' },
  { vrm: 'LittleIntermediate', fingerIndex: 4, joint: 'pip' },
  { vrm: 'LittleDistal',       fingerIndex: 4, joint: 'dip' },
];

// ===== 模型尺寸缓存（避免每次 buildClip 都重新计算）=====
interface ModelScale {
  /** hips 到肩峰的实际高度（米） */
  shoulderY: number;
  /** 实际肩宽半幅（米） */
  shoulderHalfWidth: number;
  /** hips 到头顶的实际高度（米） */
  headTopY: number;
}

const MODEL_SCALE_CACHE = new WeakMap<VRM, ModelScale>();

// ===== 辅助函数 =====

/** 读取骨骼世界位置 */
function getBoneWorldPos(node: THREE.Object3D | null, out: THREE.Vector3): THREE.Vector3 {
  if (node) node.getWorldPosition(out);
  return out;
}

/** 计算骨骼长度：子骨骼相对父骨骼的平移距离（rest pose 下即骨骼长度） */
function getBoneLength(childNode: THREE.Object3D | null, fallback: number): number {
  if (!childNode) return fallback;
  const len = childNode.position.length();
  return len > 0.001 && len < 2.0 ? len : fallback;
}

/** 计算模型实际尺寸比例（首次计算后缓存） */
function getModelScale(vrm: VRM): ModelScale {
  const cached = MODEL_SCALE_CACHE.get(vrm);
  if (cached) return cached;

  const humanoid = vrm.humanoid;
  const hipsNode = humanoid.getNormalizedBoneNode('hips' as never);
  const leftShoulder = humanoid.getNormalizedBoneNode('leftShoulder' as never);
  const rightShoulder = humanoid.getNormalizedBoneNode('rightShoulder' as never);
  const headNode = humanoid.getNormalizedBoneNode('head' as never);

  const hipsWorld = getBoneWorldPos(hipsNode, new THREE.Vector3());
  const leftWorld = getBoneWorldPos(leftShoulder, new THREE.Vector3());
  const rightWorld = getBoneWorldPos(rightShoulder, new THREE.Vector3());
  const headWorld = getBoneWorldPos(headNode, new THREE.Vector3());

  const shoulderY = Math.abs(((leftWorld.y + rightWorld.y) / 2) - hipsWorld.y) || STANDARD_SHOULDER_Y;
  const shoulderHalfWidth = Math.abs(rightWorld.x - leftWorld.x) / 2 || STANDARD_SHOULDER_HALF_WIDTH;
  const headTopY = Math.abs(headWorld.y - hipsWorld.y) + 0.10 || STANDARD_HEAD_TOP_Y;

  const scale: ModelScale = { shoulderY, shoulderHalfWidth, headTopY };
  MODEL_SCALE_CACHE.set(vrm, scale);
  return scale;
}

/**
 * Y 轴分区间缩放：适配不同头身比
 * - y ≤ STANDARD_SHOULDER_Y (0.50)：肩及以下，按"实际肩高/标准肩高"缩放
 * - y > STANDARD_SHOULDER_Y：肩以上，在 [肩, 头顶] 区间插值
 */
function scaleOffsetY(y: number, scale: ModelScale): number {
  if (y <= STANDARD_SHOULDER_Y) {
    return y * (scale.shoulderY / STANDARD_SHOULDER_Y);
  }
  const t = (y - STANDARD_SHOULDER_Y) / (STANDARD_HEAD_TOP_Y - STANDARD_SHOULDER_Y);
  return scale.shoulderY + t * (scale.headTopY - scale.shoulderY);
}

/** 字符串安全转 HandShape 枚举，无法识别时返回 OPEN_5 */
function parseHandShape(s: string): HandShape {
  const values = Object.values(HandShape);
  return (values as string[]).includes(s) ? (s as HandShape) : HandShape.OPEN_5;
}

/** 字符串安全转 HandLocation 枚举，无法识别时返回 NEUTRAL */
function parseHandLocation(s: string): HandLocation {
  const values = Object.values(HandLocation);
  return (values as string[]).includes(s) ? (s as HandLocation) : HandLocation.NEUTRAL;
}

/** 字符串安全转 FacialExpression 枚举 */
function parseFacialExpression(s: string): FacialExpression {
  const values = Object.values(FacialExpression);
  return (values as string[]).includes(s) ? (s as FacialExpression) : FacialExpression.NEUTRAL;
}

/** 根据 movement 方向对位置施加偏移（用于起止位置相同时的运动） */
function applyMovementOffset(pos: Vec3, movement: string): Vec3 {
  const offset = 0.2;
  switch (movement) {
    case 'upward':         return { ...pos, y: pos.y + offset };
    case 'downward':       return { ...pos, y: pos.y - offset };
    case 'leftward':       return { ...pos, x: pos.x - offset };
    case 'rightward':      return { ...pos, x: pos.x + offset };
    case 'toward_body':    return { ...pos, z: pos.z - offset };
    case 'away_from_body': return { ...pos, z: pos.z + offset };
    case 'horizontal_line':return { ...pos, x: pos.x + offset };
    case 'vertical_line':  return { ...pos, y: pos.y + offset };
    default: return { ...pos };
  }
}

/** 获取指定 HandLocation 对应的"相对 hips 的偏移"，NEUTRAL 时按主导手调整 x */
function getLocationOffset(location: HandLocation, dominant: 'left' | 'right'): Vec3 {
  const base = LOCATION_OFFSETS[location] ?? LOCATION_OFFSETS[HandLocation.NEUTRAL];
  if (location === HandLocation.NEUTRAL) {
    return { x: dominant === 'left' ? -0.20 : 0.20, y: base.y, z: base.z };
  }
  return { ...base };
}

/**
 * 把"相对 hips 的偏移"转换为"scene 本地坐标系下的目标位置"
 * 1. 根据模型实际尺寸缩放偏移（X 按肩宽比例，Y 分区间缩放）
 * 2. 加到 hips 在 scene 本地坐标系下的位置
 */
function offsetToSceneLocalTarget(
  offset: Vec3,
  hipsSceneLocal: THREE.Vector3,
  scale: ModelScale,
): THREE.Vector3 {
  const xScale = scale.shoulderHalfWidth / STANDARD_SHOULDER_HALF_WIDTH;
  // 此 VRM 模型本身面朝 +Z（scene 不旋转，本地坐标系 = 世界坐标系）：
  // - "前方" = +Z，与 LOCATION_OFFSETS 的 Z 正值一致 → Z 不取反
  // - "右侧" = -X（面朝 +Z 时右手边是 -X），LOCATION_OFFSETS 的 X 正值表示右侧 → X 取反
  const scaled = new THREE.Vector3(
    -offset.x * xScale,
    scaleOffsetY(offset.y, scale),
    offset.z,
  );
  return hipsSceneLocal.clone().add(scaled);
}

/** 构建轨道名：优先使用 boneNode.name，回退到 uuid */
function buildTrackName(node: THREE.Object3D): string {
  return (node.name || node.uuid) + '.quaternion';
}

// ===== 轨道构建函数 =====

/**
 * 手臂 IK 解算（直接返回四元数）
 *
 * 与 IKSolver.solve 的几何等价，但使用骨骼实际的 rest direction：
 * VRM normalized bone 在 T-pose 下手臂水平外伸，右臂 rest direction ≈ (1,0,0)，
 * 左臂 ≈ (-1,0,0)；而 IKSolver 硬编码 (0,-1,0)（Skeleton3D 约定），会导致
 * 肩部旋转错误与肘部铰链轴错误。本函数把 upperRestDir/lowerRestDir 作为参数
 * 传入，用 setFromUnitVectors 直接构造四元数，避免方向假设错误。
 */
function solveArmQuaternions(
  shoulderPos: THREE.Vector3,
  wristTarget: THREE.Vector3,
  upperLen: number,
  lowerLen: number,
  side: 'left' | 'right',
  upperRestDir: THREE.Vector3,
  lowerRestDir: THREE.Vector3,
): { upper: THREE.Quaternion; lower: THREE.Quaternion } {
  const S = shoulderPos.clone();
  const W = wristTarget.clone();
  const L1 = upperLen;
  const L2 = lowerLen;
  const totalLen = L1 + L2;

  // 肩→腕向量
  const toWrist = new THREE.Vector3().subVectors(W, S);
  let dist = toWrist.length();

  // 限制距离，避免无解
  const minReach = Math.abs(L1 - L2) + 1e-4;
  if (dist < minReach) dist = minReach;
  if (dist > totalLen * 0.999) dist = totalLen * 0.999;

  // 目标方向（归一化）
  const dir = toWrist.clone().normalize();

  // === 1. 肩部抬升角（余弦定理） ===
  const cosLift = (L1 * L1 + dist * dist - L2 * L2) / (2 * L1 * dist);
  const shoulderLift = Math.acos(Math.max(-1, Math.min(1, cosLift)));

  // === 2. 肘弯曲平面（swivel / 肘引导方向） ===
  // 肘部倾向身体内侧下方，Z 分量较大让肘部向前方伸出，防止穿入躯干
  const sideBias = side === 'left' ? 0.6 : -0.6;
  const reference = new THREE.Vector3(sideBias, -1.0, 0.6).normalize();

  // 投影到垂直于 dir 的平面
  const refDotDir = reference.dot(dir);
  let elbowDir = reference.clone().sub(dir.clone().multiplyScalar(refDotDir));
  if (elbowDir.lengthSq() < 1e-6) {
    const fallback = new THREE.Vector3(side === 'left' ? 1 : -1, 0, 0);
    elbowDir = fallback.sub(dir.clone().multiplyScalar(fallback.dot(dir)));
  }
  elbowDir.normalize();

  // === 3. 上臂方向（从肩 S 指向肘 A） ===
  const upperArmDir = dir.clone().applyAxisAngle(elbowDir, -shoulderLift);

  // === 4. 肩部四元数：把 upperRestDir 旋转到 upperArmDir ===
  const upperQuat = new THREE.Quaternion().setFromUnitVectors(upperRestDir, upperArmDir);

  // === 5. 肘部四元数 ===
  // 肘位置
  const elbowPos = S.clone().add(upperArmDir.clone().multiplyScalar(L1));
  // 前臂方向（从肘到腕，世界坐标）
  const forearmDir = new THREE.Vector3().subVectors(W, elbowPos).normalize();
  // 前臂方向转换到肘本地坐标系（应用肩部旋转的逆）
  const invUpper = upperQuat.clone().invert();
  const forearmLocalDir = forearmDir.clone().applyQuaternion(invUpper);
  // 肘部四元数：把 lowerRestDir 旋转到 forearmLocalDir
  const lowerQuat = new THREE.Quaternion().setFromUnitVectors(lowerRestDir, forearmLocalDir);

  // === 6. 肩关节角度约束（球窝关节，≤ 170°） ===
  upperQuat.copy(clampRotationAngle(upperQuat, (170 * Math.PI) / 180));

  // === 7. 肘关节铰链约束（单向弯曲 0°-150°） ===
  const hingeAxis = computeHingeAxis(upperRestDir, UP);
  lowerQuat.copy(constrainHingeJoint(
    lowerRestDir, forearmLocalDir, hingeAxis, 0, (150 * Math.PI) / 180,
  ));

  return { upper: upperQuat, lower: lowerQuat };
}

/**
 * 生成单只手臂（肩 + 肘）的 QuaternionKeyframeTrack
 * 在 5 个采样点用 lerp 插值起止位置后调用 IK，记录肩肘四元数
 */
function buildArmTracks(
  vrm: VRM,
  side: 'left' | 'right',
  startOffset: Vec3,
  endOffset: Vec3,
  durationSec: number,
  hipsSceneLocal: THREE.Vector3,
  scale: ModelScale,
): THREE.QuaternionKeyframeTrack[] {
  const humanoid = vrm.humanoid;
  const upperBoneName = side === 'left' ? 'leftUpperArm' : 'rightUpperArm';
  const lowerBoneName = side === 'left' ? 'leftLowerArm' : 'rightLowerArm';
  const handBoneName = side === 'left' ? 'leftHand' : 'rightHand';

  const upperNode = humanoid.getNormalizedBoneNode(upperBoneName as never);
  const lowerNode = humanoid.getNormalizedBoneNode(lowerBoneName as never);
  const handNode = humanoid.getNormalizedBoneNode(handBoneName as never);

  if (!upperNode || !lowerNode || !handNode) {
    log.warn(`${side} arm bone not found`, {
      upper: !!upperNode, lower: !!lowerNode, hand: !!handNode,
    });
    return [];
  }

  // 肩部在 scene 本地坐标系下的位置（getWorldPosition 已更新世界矩阵）
  const shoulderWorld = getBoneWorldPos(upperNode, new THREE.Vector3());
  const shoulderSceneLocal = vrm.scene.worldToLocal(shoulderWorld.clone());

  // 动态获取 normalized bone 的实际 rest direction
  // normalized bone 的子骨骼 position = boneWorldPos - parentBoneWorldPos
  // position 方向就是骨骼在 rest pose 下的"指向"
  const upperRestDir = lowerNode.position.clone().normalize();
  const lowerRestDir = handNode.position.clone().normalize();

  // 骨骼长度 = 子骨骼 position 的长度（与 rest direction 来源一致）
  const upperArmLen = lowerNode.position.length() || 0.28;
  const forearmLen = handNode.position.length() || 0.26;

  // 起止目标位置（scene 本地坐标）
  const startTarget = offsetToSceneLocalTarget(startOffset, hipsSceneLocal, scale);
  const endTarget = offsetToSceneLocalTarget(endOffset, hipsSceneLocal, scale);

  // 5 个采样点的四元数（每个 4 个分量：x, y, z, w）
  const times = SAMPLE_TIMES.map(t => t * durationSec);
  const upperQuats: number[] = [];
  const lowerQuats: number[] = [];

  for (const t of SAMPLE_TIMES) {
    const target = new THREE.Vector3().lerpVectors(startTarget, endTarget, t);

    // IK 解算（使用实际 rest direction，直接返回四元数）
    const ik = solveArmQuaternions(
      shoulderSceneLocal,
      target,
      upperArmLen,
      forearmLen,
      side,
      upperRestDir,
      lowerRestDir,
    );

    upperQuats.push(ik.upper.x, ik.upper.y, ik.upper.z, ik.upper.w);
    lowerQuats.push(ik.lower.x, ik.lower.y, ik.lower.z, ik.lower.w);
  }

  return [
    new THREE.QuaternionKeyframeTrack(buildTrackName(upperNode), times, upperQuats),
    new THREE.QuaternionKeyframeTrack(buildTrackName(lowerNode), times, lowerQuats),
  ];
}

/**
 * 生成保持 rest pose 的手臂轨道（单位四元数）
 * 用于非主导手或单手动作时的另一只手臂
 */
function buildRestArmTracks(
  vrm: VRM,
  side: 'left' | 'right',
  durationSec: number,
): THREE.QuaternionKeyframeTrack[] {
  const humanoid = vrm.humanoid;
  const upperBoneName = side === 'left' ? 'leftUpperArm' : 'rightUpperArm';
  const lowerBoneName = side === 'left' ? 'leftLowerArm' : 'rightLowerArm';

  const upperNode = humanoid.getNormalizedBoneNode(upperBoneName as never);
  const lowerNode = humanoid.getNormalizedBoneNode(lowerBoneName as never);
  if (!upperNode || !lowerNode) return [];

  // 两个采样点都是单位四元数 (0,0,0,1)
  const times = [0, durationSec];
  const identity = [0, 0, 0, 1, 0, 0, 0, 1];

  return [
    new THREE.QuaternionKeyframeTrack(buildTrackName(upperNode), times, identity),
    new THREE.QuaternionKeyframeTrack(buildTrackName(lowerNode), times, identity),
  ];
}

/**
 * 生成手指骨的 QuaternionKeyframeTrack（每只手 15 个）
 * 从 HandShape 查表获取屈曲角度，绕本地 X 轴旋转
 * 起止手形间用 2 个关键帧线性插值（AnimationMixer 自动平滑）
 */
function buildFingerTracks(
  vrm: VRM,
  side: 'left' | 'right',
  shapeStart: HandShape,
  shapeEnd: HandShape,
  durationSec: number,
): THREE.QuaternionKeyframeTrack[] {
  const humanoid = vrm.humanoid;
  const prefix = side === 'left' ? 'left' : 'right';
  const startDef = getHandShapeDefinition(shapeStart);
  const endDef = getHandShapeDefinition(shapeEnd);

  const tracks: THREE.QuaternionKeyframeTrack[] = [];
  const times = [0, durationSec];

  for (const { vrm: boneSuffix, fingerIndex, joint } of FINGER_BONE_NAMES) {
    const startFinger = startDef.fingers[fingerIndex];
    const endFinger = endDef.fingers[fingerIndex];
    if (!startFinger || !endFinger) continue;

    const startAngle = joint === 'mcp' ? startFinger.mcp : joint === 'pip' ? startFinger.pip : startFinger.dip;
    const endAngle = joint === 'mcp' ? endFinger.mcp : joint === 'pip' ? endFinger.pip : endFinger.dip;

    const boneNode = humanoid.getNormalizedBoneNode(`${prefix}${boneSuffix}` as never);
    if (!boneNode) continue;

    // 手指屈曲绕本地 X 轴，Y/Z 为 0
    const startQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(startAngle, 0, 0, 'XYZ'));
    const endQuat = new THREE.Quaternion().setFromEuler(new THREE.Euler(endAngle, 0, 0, 'XYZ'));
    const values = [
      startQuat.x, startQuat.y, startQuat.z, startQuat.w,
      endQuat.x, endQuat.y, endQuat.z, endQuat.w,
    ];

    tracks.push(new THREE.QuaternionKeyframeTrack(buildTrackName(boneNode), times, values));
  }

  return tracks;
}

/**
 * 生成表情的 NumberKeyframeTrack
 * 轨道名格式：expressionManager.<preset>（如 expressionManager.happy）
 * 表情在整个词汇期间保持目标值，由 VRMAnimator 的 fadeIn/fadeOut 处理过渡
 *
 * 注意：Task 4 需要在 scene 中添加名为 'expressionManager' 的代理 Object3D，
 * 并为其添加 preset 属性（getter/setter 转发到 vrm.expressionManager.setValue），
 * 否则 AnimationMixer 无法解析此轨道。
 */
function buildExpressionTrack(
  expression: FacialExpression,
  durationSec: number,
): THREE.NumberKeyframeTrack | null {
  const preset = EXPRESSION_MAP[expression] ?? 'neutral';
  // 中性表情不生成轨道（避免覆盖其他 action 的表情）
  if (preset === 'neutral') return null;

  const times = [0, durationSec];
  const values = [1, 1];

  return new THREE.NumberKeyframeTrack(`expressionManager.${preset}`, times, values);
}

// ===== 主类 =====

/**
 * ClipBuilder：从 SignGloss 生成 THREE.AnimationClip
 *
 * 工作流程：
 *   1. 解析 manual 参数（手形、位置、运动方向）
 *   2. 计算起止位置（含 movement 偏移）
 *   3. 生成 5 个采样点的 IK 解算（肩、肘四元数）
 *   4. 构建手指轨道（起止手形插值）
 *   5. 构建表情轨道
 *   6. 返回 AnimationClip
 *
 * 坐标系约定：
 *   - IK 输入使用 scene 本地坐标系（非世界坐标）
 *   - 肩部位置：getNormalizedBoneNode('rightUpperArm').getWorldPosition() → scene.worldToLocal()
 *   - 手腕目标：hips 在 scene 本地坐标 + 缩放后的 LOCATION_OFFSETS
 *   - 这样轨道设置的骨骼本地旋转与 IK 解算的旋转一致（rest pose 下本地=scene 方向）
 *
 * 骨骼节点：使用 normalized bone API（getNormalizedBoneNode），因为 vrm.update() 会用
 * normalized bone 覆盖 raw bone（autoUpdateHumanBones=true），直接写 raw bone 会被冲掉。
 */
export class ClipBuilder {
  /**
   * 从 SignGloss 生成 AnimationClip
   * @param gloss 词汇表数据
   * @param vrm VRM 模型实例
   * @returns THREE.AnimationClip，包含肩、肘、手指、表情轨道
   */
  static buildClip(gloss: SignGloss, vrm: VRM): THREE.AnimationClip {
    const m = gloss.manual;
    const dominant = m.dominant_hand;
    const shapeStart = parseHandShape(m.handshape_start);
    const shapeEnd = parseHandShape(m.handshape_end);
    const locStart = parseHandLocation(m.location_start);
    const locEnd = parseHandLocation(m.location_end);

    // 起止位置（相对 hips 的偏移）
    const startOffset = getLocationOffset(locStart, dominant);
    let endOffset = getLocationOffset(locEnd, dominant);
    // 起止位置相同且 movement 非静态时，根据 movement 方向施加偏移
    if (locStart === locEnd && m.movement !== Movement.STATIC) {
      endOffset = applyMovementOffset(endOffset, m.movement);
    }

    // 动画时长（秒）
    const durationMs = gloss.duration_ms > 0 ? gloss.duration_ms : DEFAULT_DURATION_MS;
    const durationSec = durationMs / 1000;

    // 模型尺寸（首次计算后缓存）
    const scale = getModelScale(vrm);

    // hips 在 scene 本地坐标系下的位置
    const hipsNode = vrm.humanoid.getNormalizedBoneNode('hips' as never);
    if (!hipsNode) {
      log.warn('hips bone not found, return empty clip', { glossId: gloss.gloss_id });
      return new THREE.AnimationClip(`gloss_${gloss.gloss_id}`, 0, []);
    }
    const hipsWorld = getBoneWorldPos(hipsNode, new THREE.Vector3());
    const hipsSceneLocal = vrm.scene.worldToLocal(hipsWorld.clone());

    // 生成轨道
    const tracks: THREE.KeyframeTrack[] = [];

    // 1. 主导手手臂轨道（肩 + 肘）
    const domArmTracks = buildArmTracks(
      vrm, dominant, startOffset, endOffset, durationSec, hipsSceneLocal, scale,
    );
    tracks.push(...domArmTracks);

    // 2. 主导手手指轨道
    const domFingerTracks = buildFingerTracks(vrm, dominant, shapeStart, shapeEnd, durationSec);
    tracks.push(...domFingerTracks);

    // 3. 副手轨道
    const nonDominant = dominant === 'left' ? 'right' : 'left';
    if (m.is_two_handed) {
      // 双手动作：副手镜像 IK 目标（X 取反）
      const mirrorStart = { x: -startOffset.x, y: startOffset.y, z: startOffset.z };
      const mirrorEnd = { x: -endOffset.x, y: endOffset.y, z: endOffset.z };
      const nonDomArmTracks = buildArmTracks(
        vrm, nonDominant, mirrorStart, mirrorEnd, durationSec, hipsSceneLocal, scale,
      );
      tracks.push(...nonDomArmTracks);
      const nonDomFingerTracks = buildFingerTracks(vrm, nonDominant, shapeStart, shapeEnd, durationSec);
      tracks.push(...nonDomFingerTracks);
    } else {
      // 单手动作：副手保持 rest pose
      const restArmTracks = buildRestArmTracks(vrm, nonDominant, durationSec);
      tracks.push(...restArmTracks);
    }

    // 4. 表情轨道
    const expressionStr = gloss.non_manual?.expression;
    if (expressionStr) {
      const expr = parseFacialExpression(expressionStr);
      const exprTrack = buildExpressionTrack(expr, durationSec);
      if (exprTrack) tracks.push(exprTrack);
    }

    const clip = new THREE.AnimationClip(`gloss_${gloss.gloss_id}`, durationSec, tracks);
    log.debug('buildClip', {
      glossId: gloss.gloss_id,
      trackCount: tracks.length,
      durationSec,
      dominant,
      isTwoHanded: m.is_two_handed,
    });
    return clip;
  }
}
