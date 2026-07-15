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
import { HandLocation, HandShape, FacialExpression, Movement, PalmOrientation } from '@/types/sign';
import type { Vec3 } from '@/types/avatar';
import { getHandShapeDefinition } from './HandShape';
import { computeHingeAxis, constrainHingeJoint, constrainShoulderByDirection, constrainForearmRotation, applyVRMCConstraints, getVRMConstraintCache, type VRMConstraintMap } from './JointLimits';
import { buildBodyVolume, isInsideTorso, isInsideHead, projectToSurface, type BodyVolume } from './BodyVolume';
import { parseHandShape, parseHandLocation, parseFacialExpression, parsePalmOrientation } from './EnumParser';
import { logger } from '@/modules/debug/logger';

const log = logger.module('ClipBuilder');

// ===== 标准人体比例（与 AvatarDriver VRM_LOCATION_OFFSETS 一致）=====
const STANDARD_SHOULDER_Y = 0.50;
const STANDARD_HEAD_TOP_Y = 0.80;
const STANDARD_SHOULDER_HALF_WIDTH = 0.22;

/** 默认动作时长（毫秒） */
const DEFAULT_DURATION_MS = 1000;

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

// ===== VRMC 约束状态（由 buildClip 入口设置，solveArmQuaternions 读取）=====
// 当前 VRM 模型的约束缓存（buildClip 入口从全局缓存读取，避免每帧重复读取）
let currentVRMConstraints: VRMConstraintMap = new Map();
// 本 clip 的 VRMC 约束命中/回退统计（buildClip 入口重置，末尾输出日志）
let vrmcHitCount = 0;
let vrmcFallbackCount = 0;

// ===== 辅助函数 =====

/** 读取骨骼世界位置 */
function getBoneWorldPos(node: THREE.Object3D | null, out: THREE.Vector3): THREE.Vector3 {
  if (node) node.getWorldPosition(out);
  return out;
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

/** 轨迹点：时间（秒）+ scene 本地坐标系下的目标位置 */
interface TrajectoryPoint {
  time: number;
  position: THREE.Vector3;
}

/**
 * 根据 Movement 枚举生成手臂运动轨迹点
 * 所有点的 time 在 [0, durationSec] 范围内均匀分布
 * @param movement 运动类型枚举
 * @param startTarget 起始目标位置（scene 本地坐标系）
 * @param endTarget 终止目标位置（scene 本地坐标系）
 * @param durationSec 动画时长（秒）
 * @returns 轨迹点数组
 */
function buildMovementTrajectory(
  movement: Movement,
  startTarget: THREE.Vector3,
  endTarget: THREE.Vector3,
  durationSec: number,
): TrajectoryPoint[] {
  // 线性类运动：5 点线性插值
  const buildLinear = (count: number): TrajectoryPoint[] => {
    const points: TrajectoryPoint[] = [];
    for (let i = 0; i < count; i++) {
      const t = i / (count - 1);
      points.push({
        time: t * durationSec,
        position: startTarget.clone().lerp(endTarget, t),
      });
    }
    return points;
  };

  switch (movement) {
    // 1. 线性类（含 STATIC：起止相同，所有点位置一致）
    case Movement.STATIC:
    case Movement.UPWARD:
    case Movement.DOWNWARD:
    case Movement.LEFTWARD:
    case Movement.RIGHTWARD:
    case Movement.TOWARD_BODY:
    case Movement.AWAY_FROM_BODY:
    case Movement.FORWARD:
    case Movement.HORIZONTAL_LINE:
    case Movement.VERTICAL_LINE:
      return buildLinear(5);

    // 2. 弧线类：线性插值 + Y 方向抛物线偏移
    case Movement.UPWARD_ARC:
    case Movement.DOWNWARD_ARC: {
      const yOffset = movement === Movement.UPWARD_ARC ? 0.15 : -0.15;
      const points: TrajectoryPoint[] = [];
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        const pos = startTarget.clone().lerp(endTarget, t);
        pos.y += 4 * t * (1 - t) * yOffset;
        points.push({ time: t * durationSec, position: pos });
      }
      return points;
    }

    // 3. 圆形：8 点圆周运动（XZ 平面）
    case Movement.CIRCULAR: {
      const center = startTarget.clone().add(endTarget).multiplyScalar(0.5);
      const radius = 0.15;
      const points: TrajectoryPoint[] = [];
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const theta = t * Math.PI * 2;
        points.push({
          time: t * durationSec,
          position: new THREE.Vector3(
            center.x + radius * Math.cos(theta),
            center.y,
            center.z + radius * Math.sin(theta),
          ),
        });
      }
      return points;
    }

    // 4. 之字形：6 点折线，X 方向交替偏移
    case Movement.ZIGZAG: {
      const xOffsets = [0, 0.1, -0.1, 0.1, -0.1, 0];
      const points: TrajectoryPoint[] = [];
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const pos = startTarget.clone().lerp(endTarget, t);
        pos.x += xOffsets[i];
        points.push({ time: t * durationSec, position: pos });
      }
      return points;
    }

    // 5. 摆动：8 点往复振荡，X 方向叠加正弦波（2 个周期）
    case Movement.WAVE:
    case Movement.SIDE_TO_SIDE:
    case Movement.WAVE_TWIST: {
      const amplitude = 0.12;
      const sameStartEnd = startTarget.equals(endTarget);
      const points: TrajectoryPoint[] = [];
      for (let i = 0; i < 8; i++) {
        const t = i / 8;
        const base = sameStartEnd
          ? startTarget.clone()
          : startTarget.clone().lerp(endTarget, t);
        base.x += amplitude * Math.sin(2 * Math.PI * 2 * t);
        points.push({ time: t * durationSec, position: base });
      }
      return points;
    }

    // 6. 点触 TAP：5 点 1 次往返（start→接触→start→接触→start）
    case Movement.TAP: {
      const contact = startTarget.clone().add(new THREE.Vector3(0, 0, 0.1));
      const positions = [
        startTarget.clone(), contact, startTarget.clone(),
        contact.clone(), startTarget.clone(),
      ];
      return positions.map((pos, i) => ({
        time: (i / 4) * durationSec,
        position: pos,
      }));
    }

    // 6b. 点触 TAP_TWICE：6 点 2 次往返
    case Movement.TAP_TWICE: {
      const contact = startTarget.clone().add(new THREE.Vector3(0, 0, 0.1));
      const positions = [
        startTarget.clone(), contact, startTarget.clone(),
        contact.clone(), startTarget.clone(), contact.clone(),
      ];
      return positions.map((pos, i) => ({
        time: (i / 5) * durationSec,
        position: pos,
      }));
    }

    // 7. 勾连：5 点向中心汇聚，X 渐趋向 0，Y 渐降
    case Movement.HOOK_TOGETHER: {
      const points: TrajectoryPoint[] = [];
      for (let i = 0; i < 5; i++) {
        const t = i / 4;
        points.push({
          time: t * durationSec,
          position: new THREE.Vector3(
            THREE.MathUtils.lerp(startTarget.x, 0, t),
            THREE.MathUtils.lerp(startTarget.y, endTarget.y, t) - 0.05 * t,
            THREE.MathUtils.lerp(startTarget.z, endTarget.z, t),
          ),
        });
      }
      return points;
    }

    default:
      return buildLinear(5);
  }
}

/**
 * 在 IK 解算的手腕四元数上叠加掌向旋转修正
 * IK 解算默认让手掌朝向身体内侧（INWARD），其他朝向需要额外旋转
 */
function applyPalmOrientation(
  orientation: PalmOrientation,
  side: 'left' | 'right',
): THREE.Quaternion {
  const sign = side === 'left' ? -1 : 1;
  switch (orientation) {
    case PalmOrientation.INWARD:
      return new THREE.Quaternion(); // identity，IK 默认已向内
    case PalmOrientation.OUTWARD:
      // 绕 Z 轴翻转 π（掌心向外）
      return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), Math.PI);
    case PalmOrientation.UPWARD:
      // 绕 X 轴旋转 -π/2（掌心朝上）
      return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2 * sign);
    case PalmOrientation.DOWNWARD:
      // 绕 X 轴旋转 π/2（掌心朝下）
      return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2 * sign);
    case PalmOrientation.LEFTWARD:
      return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), -Math.PI / 2 * sign);
    case PalmOrientation.RIGHTWARD:
      return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), Math.PI / 2 * sign);
    default:
      return new THREE.Quaternion();
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
  bodyVolume?: BodyVolume,
  hipsDir?: THREE.Vector3,
): { upper: THREE.Quaternion; lower: THREE.Quaternion; elbowPenetrated: boolean } {
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
  // 肘引导方向基于 shoulder → hips 向量动态推导，适配不同 rest pose：
  // - Y 分量来自 hipsDir（指向下的躯干方向），让肘部倾向身体下方
  // - Z 分量前伸（+0.6），防止肘部向后穿入躯干
  // - X 分量侧偏（upperRestDir.x × 0.6），适配 T-pose（手臂水平外展时侧偏明显）
  //   与 A-pose（upperRestDir.x ≈ 0，侧偏退化，依赖 Y/Z 引导）
  // 旧实现硬编码 (sideBias, -1.0, 0.6)，对 A-pose 失效：A-pose 时 upperRestDir.x ≈ 0，
  // 硬编码 reference.y = -1 与 hipsDir.y 方向相同但缺少 scene 实际朝向信息；
  // 动态化后即便 shoulder→hips 不严格垂直（脊柱前倾等）也能正确引导
  const downDir = hipsDir ?? new THREE.Vector3(0, -1, 0);
  const reference = new THREE.Vector3(
    downDir.x + upperRestDir.x * 0.6,  // X：侧偏（适配 T-pose 与 A-pose）
    downDir.y,                          // Y：向下（来自 shoulder→hips 方向）
    downDir.z + 0.6,                    // Z：前伸（防止肘向后穿入躯干）
  ).normalize();

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

  // 肘部穿透检测与修正：当肘位置穿入躯干胶囊时，沿外法线投影到躯干表面。
  // 防止 IK 解算后肘部嵌入躯干（如手腕目标在身前近端时，上臂可能向内弯折导致肘穿入）
  let correctedElbowPos = elbowPos;
  const elbowPenetrated = !!(bodyVolume && isInsideTorso(elbowPos, bodyVolume));
  if (elbowPenetrated) {
    correctedElbowPos = projectToSurface(elbowPos, bodyVolume);
    log.debug('肘部穿透修正', {
      side,
      original: elbowPos.clone(),
      corrected: correctedElbowPos.clone(),
    });
  }

  // 前臂方向（从修正后的肘到腕，世界坐标）
  const forearmDir = new THREE.Vector3().subVectors(W, correctedElbowPos).normalize();
  // 前臂方向转换到肘本地坐标系（应用肩部旋转的逆）
  const invUpper = upperQuat.clone().invert();
  const forearmLocalDir = forearmDir.clone().applyQuaternion(invUpper);
  // 肘部四元数：把 lowerRestDir 旋转到 forearmLocalDir
  const lowerQuat = new THREE.Quaternion().setFromUnitVectors(lowerRestDir, forearmLocalDir);

  // === 6. 肩关节角度约束（按解剖学方向分别限制：外展≤120°/前屈≤180°/后伸≤60°） ===
  // 旧实现用 clampRotationAngle(170°) 一刀切，无法区分外展与前屈，且对 A-pose 不友好；
  // constrainShoulderByDirection 自动适配 T-pose / A-pose 并按主旋转方向选择限制值
  upperQuat.copy(constrainShoulderByDirection(upperQuat, upperRestDir));

  // === 7. 肘关节铰链约束（单向弯曲 0°-150°） ===
  const hingeAxis = computeHingeAxis(upperRestDir, UP);

  // 诊断用：手动计算 signedAngle（与 constrainHingeJoint 内部逻辑一致）
  const _diagDot = THREE.MathUtils.clamp(lowerRestDir.dot(forearmLocalDir), -1, 1);
  const _diagAngle = Math.acos(_diagDot);
  const _diagRotAxis = new THREE.Vector3().crossVectors(lowerRestDir, forearmLocalDir);
  let signedAngle = 0;
  if (_diagRotAxis.lengthSq() > 1e-6) {
    _diagRotAxis.normalize();
    signedAngle = _diagRotAxis.dot(hingeAxis) * _diagAngle;
  }

  lowerQuat.copy(constrainHingeJoint(
    lowerRestDir, forearmLocalDir, hingeAxis, 0, (150 * Math.PI) / 180,
  ));
  // 铰链约束之后追加前臂旋前/旋后限制（±80°），传入纯铰链四元数避免与弯曲耦合
  lowerQuat.copy(constrainForearmRotation(lowerQuat, hingeAxis));

  // === 8. VRMC_node_constraint 约束（如有） ===
  // 优先使用 VRM 1.0 模型内置约束（roll/aim/rotation），无约束时跳过本步骤
  // 约束缓存由 VRMModel.tsx 在 VRM 加载时填充，由 buildClip 入口写入 currentVRMConstraints
  if (currentVRMConstraints.size > 0) {
    const upperBoneName = side === 'left' ? 'leftUpperArm' : 'rightUpperArm';
    const lowerBoneName = side === 'left' ? 'leftLowerArm' : 'rightLowerArm';
    const result = applyVRMCConstraints(upperQuat, lowerQuat, upperBoneName, lowerBoneName, currentVRMConstraints);
    if (result.applied) {
      upperQuat.copy(result.upper);
      lowerQuat.copy(result.lower);
      vrmcHitCount++;
    } else {
      vrmcFallbackCount++;
    }
  }

  log.debug('solveArmQuaternions 诊断', {
    side,
    upperRestDir: { x: upperRestDir.x, y: upperRestDir.y, z: upperRestDir.z },
    lowerRestDir: { x: lowerRestDir.x, y: lowerRestDir.y, z: lowerRestDir.z },
    shoulderPos: { x: S.x, y: S.y, z: S.z },
    wristTarget: { x: W.x, y: W.y, z: W.z },
    dir: { x: dir.x, y: dir.y, z: dir.z },
    shoulderLift: shoulderLift * 180 / Math.PI,
    elbowDir: { x: elbowDir.x, y: elbowDir.y, z: elbowDir.z },
    upperArmDir: { x: upperArmDir.x, y: upperArmDir.y, z: upperArmDir.z },
    elbowPos: { x: elbowPos.x, y: elbowPos.y, z: elbowPos.z },
    forearmDir: { x: forearmDir.x, y: forearmDir.y, z: forearmDir.z },
    forearmLocalDir: { x: forearmLocalDir.x, y: forearmLocalDir.y, z: forearmLocalDir.z },
    hingeAxis: { x: hingeAxis.x, y: hingeAxis.y, z: hingeAxis.z },
    hingeAxisLength: hingeAxis.length(),
    signedAngle: signedAngle * 180 / Math.PI,
  });

  return { upper: upperQuat, lower: lowerQuat, elbowPenetrated };
}

/**
 * 生成单只手臂（肩 + 肘 + 手腕）的 QuaternionKeyframeTrack
 * 使用 buildMovementTrajectory 生成运动路径，对每个点调用 IK 解算
 * 手腕轨道由 palmOrientation 常量四元数驱动
 */
function buildArmTracks(
  vrm: VRM,
  side: 'left' | 'right',
  startOffset: Vec3,
  endOffset: Vec3,
  durationSec: number,
  hipsSceneLocal: THREE.Vector3,
  scale: ModelScale,
  movement: Movement,
  palmOrientation: PalmOrientation,
  clipLabel: string,
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

  // 构建身体包络体（每个 buildArmTracks 调用构建一次，避免每轨迹点重复计算）。
  // 用于：1) 轨迹点手腕目标的合法性约束；2) solveArmQuaternions 内肘部穿透检测
  const bodyVolume = buildBodyVolume(vrm);

  // 计算 shoulder → hips 方向（指向下的躯干方向），作为肘引导方向的动态参考。
  // 旧实现硬编码 (sideBias, -1.0, 0.6) 对 A-pose 失效；改用实际骨骼方向后，
  // 即便脊柱前倾、hips 偏移等情况也能正确引导肘部倾向身体下方。
  // 复用传入的 hipsSceneLocal 参数（已由调用方计算），避免重复读取骨骼与重复声明
  const hipsDir = new THREE.Vector3().subVectors(hipsSceneLocal, shoulderSceneLocal).normalize();

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

  // 诊断日志：每 clip 只输出一次（非每采样点）
  log.debug('buildArmTracks 诊断', {
    side,
    upperRestDir: { x: upperRestDir.x, y: upperRestDir.y, z: upperRestDir.z },
    lowerRestDir: { x: lowerRestDir.x, y: lowerRestDir.y, z: lowerRestDir.z },
    upperArmLen,
    forearmLen,
    shoulderSceneLocal: { x: shoulderSceneLocal.x, y: shoulderSceneLocal.y, z: shoulderSceneLocal.z },
    startTarget: { x: startTarget.x, y: startTarget.y, z: startTarget.z },
    endTarget: { x: endTarget.x, y: endTarget.y, z: endTarget.z },
  });

  // 使用轨迹函数生成运动路径点（替代旧的线性插值）
  const trajectory = buildMovementTrajectory(movement, startTarget, endTarget, durationSec);

  // 轨迹点合法性约束：手腕目标若穿入躯干或头部，沿外法线投影到包络表面。
  // 在 IK 解算之前修正，避免解算出的肩肘四元数导致手腕穿模；
  // 就地修改 point.position（trajectory 为本函数局部对象，不影响外部）
  // 统计穿入数量用于数据级验证日志
  let torsoHits = 0;
  let headHits = 0;
  for (const point of trajectory) {
    if (isInsideTorso(point.position, bodyVolume)) {
      torsoHits++;
      point.position.copy(projectToSurface(point.position, bodyVolume));
    } else if (isInsideHead(point.position, bodyVolume)) {
      headHits++;
      point.position.copy(projectToSurface(point.position, bodyVolume));
    }
  }

  const times = trajectory.map(p => p.time);
  const upperQuats: number[] = [];
  const lowerQuats: number[] = [];

  // 对每个轨迹点进行 IK 解算，记录肩肘四元数
  // 累计肘部穿透次数用于数据级验证日志
  let elbowPenetrationCount = 0;
  for (const point of trajectory) {
    const ik = solveArmQuaternions(
      shoulderSceneLocal,
      point.position,
      upperArmLen,
      forearmLen,
      side,
      upperRestDir,
      lowerRestDir,
      bodyVolume,  // 传入用于肘部穿透检测
      hipsDir,     // 传入用于肘引导方向动态化
    );

    if (ik.elbowPenetrated) elbowPenetrationCount++;

    upperQuats.push(ik.upper.x, ik.upper.y, ik.upper.z, ik.upper.w);
    lowerQuats.push(ik.lower.x, ik.lower.y, ik.lower.z, ik.lower.w);
  }

  // 数据级验证日志：汇总本 clip 的穿模修正统计（info 级别，便于浏览器控制台捕获）
  log.info(
    `[穿模统计] ${clipLabel} | side=${side} | 轨迹点=${trajectory.length} | 躯干穿入=${torsoHits} | 头部穿入=${headHits} | 肘部穿入=${elbowPenetrationCount}`,
  );

  // 掌向修正四元数（常量，不随轨迹点变化）
  const palmQuat = applyPalmOrientation(palmOrientation, side);
  const handQuats: number[] = [];
  for (let i = 0; i < trajectory.length; i++) {
    handQuats.push(palmQuat.x, palmQuat.y, palmQuat.z, palmQuat.w);
  }

  return [
    new THREE.QuaternionKeyframeTrack(buildTrackName(upperNode), times, upperQuats),
    new THREE.QuaternionKeyframeTrack(buildTrackName(lowerNode), times, lowerQuats),
    new THREE.QuaternionKeyframeTrack(buildTrackName(handNode), times, handQuats),
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
 * 代理 Object3D 已在 VRMAnimator 构造函数中创建并添加到 vrm.scene：
 * 名为 'expressionManager'，对每个预设定 getter/setter 转发到
 * vrm.expressionManager.setValue/getValue，使 AnimationMixer 的 PropertyBinding
 * 能正确解析 'expressionManager.<preset>' 轨道名。
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
    // 初始化本 clip 的 VRMC 约束状态：从全局缓存读取约束映射，重置命中/回退计数
    currentVRMConstraints = getVRMConstraintCache(vrm);
    vrmcHitCount = 0;
    vrmcFallbackCount = 0;

    const m = gloss.manual;
    const dominant = m.dominant_hand;
    const shapeStart = parseHandShape(m.handshape_start);
    const shapeEnd = parseHandShape(m.handshape_end);
    const locStart = parseHandLocation(m.location_start);
    const locEnd = parseHandLocation(m.location_end);

    // 起止位置（相对 hips 的偏移）
    const startOffset = getLocationOffset(locStart, dominant);
    const endOffset = getLocationOffset(locEnd, dominant);

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

    // 1. 主导手手臂轨道（肩 + 肘 + 手腕）
    const domArmTracks = buildArmTracks(
      vrm, dominant, startOffset, endOffset, durationSec, hipsSceneLocal, scale,
      m.movement as Movement, parsePalmOrientation(m.palm_orientation), gloss.gloss_id,
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
        m.movement as Movement, parsePalmOrientation(m.palm_orientation), gloss.gloss_id,
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
    // VRMC 约束统计：命中数表示成功应用 roll 分布的采样点数，回退数为跳过的采样点数
    log.info(
      `[VRMC约束] ${gloss.gloss_id} | 命中=${vrmcHitCount} | 回退=${vrmcFallbackCount} | 总约束数=${currentVRMConstraints.size}`,
    );
    return clip;
  }
}
