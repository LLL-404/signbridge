// BodyVolume：身体包络体（轻量碰撞体积）构建与穿透检测
// 用于离线 clip 构建阶段做手腕/肘部目标点的穿透检测与投影修正，
// 不是物理引擎，不参与运行时。所有坐标均在 VRM scene 本地坐标系下
// （与 ClipBuilder 的 IK 目标坐标系一致）。
import * as THREE from 'three';
import type { VRM } from '@pixiv/three-vrm';
import { logger } from '@/modules/debug/logger';

const log = logger.module('BodyVolume');

/** 胶囊体：两端点 + 半径 */
export interface Capsule {
  /** 轴线起点（scene 本地坐标系） */
  start: THREE.Vector3;
  /** 轴线终点 */
  end: THREE.Vector3;
  radius: number;
}

/** 球体 */
export interface Sphere {
  center: THREE.Vector3;
  radius: number;
}

/** 身体包络体集合 */
export interface BodyVolume {
  /** 躯干胶囊（中轴 = spine → neck） */
  torso: Capsule;
  /** 头部球 */
  head: Sphere;
  /** 上臂胶囊 */
  upperArms: { left: Capsule; right: Capsule };
  /** 前臂胶囊 */
  forearms: { left: Capsule; right: Capsule };
}

// ===== 防御性默认值（仅当骨骼缺失时使用）=====
const DEFAULT_SHOULDER_WIDTH = 0.22;
const DEFAULT_TORSO_HEIGHT = 0.5;
const DEFAULT_HEAD_RADIUS = 0.10;
const DEFAULT_ARM_RADIUS = 0.04;
// ===== 几何比例因子（从骨骼实际尺寸推导半径，禁止硬编码尺寸数值）=====
const TORSO_RADIUS_FACTOR = 0.45; // 躯干半径 = 肩宽 × 0.45
const HEAD_RADIUS_FACTOR = 0.6;   // 头部半径 = head→neck 距离 × 0.6
const ARM_RADIUS_FACTOR = 0.12;   // 手臂半径 = 骨骼长度 × 0.12

const EPSILON = 1e-6;

/** 读取 normalized bone 节点（封装 'as never' cast，与 ClipBuilder 一致） */
function getBone(vrm: VRM, name: string): THREE.Object3D | null {
  return vrm.humanoid.getNormalizedBoneNode(name as never);
}

/**
 * 将骨骼世界位置转换到 scene 本地坐标系。
 * 节点为空时返回 null；否则返回新建的 Vector3。
 */
function readBoneSceneLocal(
  vrm: VRM,
  node: THREE.Object3D | null,
): THREE.Vector3 | null {
  if (!node) return null;
  const out = new THREE.Vector3();
  node.getWorldPosition(out);
  vrm.scene.worldToLocal(out);
  return out;
}

/**
 * 从 VRM normalized bone 实际世界位置推导所有包络参数。
 * 所有点都在 scene 本地坐标系下（与 ClipBuilder IK 一致）。
 * 任何骨骼缺失都会回退到合理默认值并打 warn 日志。
 */
export function buildBodyVolume(vrm: VRM): BodyVolume {
  // 读取各骨骼在 scene 本地坐标系下的位置
  const hipsPos = readBoneSceneLocal(vrm, getBone(vrm, 'hips'));
  const spinePos = readBoneSceneLocal(vrm, getBone(vrm, 'spine'));
  const neckPos = readBoneSceneLocal(vrm, getBone(vrm, 'neck'));
  const headPos = readBoneSceneLocal(vrm, getBone(vrm, 'head'));
  const leftShoulderPos = readBoneSceneLocal(vrm, getBone(vrm, 'leftShoulder'));
  const rightShoulderPos = readBoneSceneLocal(vrm, getBone(vrm, 'rightShoulder'));
  const leftUpperArmPos = readBoneSceneLocal(vrm, getBone(vrm, 'leftUpperArm'));
  const rightUpperArmPos = readBoneSceneLocal(vrm, getBone(vrm, 'rightUpperArm'));
  const leftLowerArmPos = readBoneSceneLocal(vrm, getBone(vrm, 'leftLowerArm'));
  const rightLowerArmPos = readBoneSceneLocal(vrm, getBone(vrm, 'rightLowerArm'));
  const leftHandPos = readBoneSceneLocal(vrm, getBone(vrm, 'leftHand'));
  const rightHandPos = readBoneSceneLocal(vrm, getBone(vrm, 'rightHand'));

  // ===== 躯干胶囊：中轴 = spine → neck =====
  const torsoStart: THREE.Vector3 = spinePos ?? hipsPos ?? new THREE.Vector3();
  if (!spinePos) {
    log.warn(
      hipsPos
        ? 'spine bone not found, torso start fallback to hips'
        : 'spine/hips bones not found, torso start fallback to origin',
    );
  }

  let torsoEnd: THREE.Vector3;
  if (neckPos) {
    torsoEnd = neckPos;
  } else if (headPos) {
    log.warn('neck bone not found, torso end fallback to head');
    torsoEnd = headPos;
  } else {
    log.warn('neck/head bones not found, torso end fallback to spine + DEFAULT_TORSO_HEIGHT');
    // 从 spine 位置向上偏移 DEFAULT_TORSO_HEIGHT（构造新 Vector3，不修改 spinePos）
    const base = spinePos ?? new THREE.Vector3();
    torsoEnd = new THREE.Vector3(base.x, base.y + DEFAULT_TORSO_HEIGHT, base.z);
  }

  // ===== 肩宽：|leftShoulder.x - rightShoulder.x|，肩缺失时回退到 upperArm =====
  let shoulderWidth: number;
  if (leftShoulderPos && rightShoulderPos) {
    shoulderWidth = Math.abs(leftShoulderPos.x - rightShoulderPos.x);
  } else if (leftUpperArmPos && rightUpperArmPos) {
    log.warn('shoulder bones not found, fallback to upperArm for shoulder width');
    shoulderWidth = Math.abs(leftUpperArmPos.x - rightUpperArmPos.x);
  } else {
    log.warn('shoulder and upperArm bones not found, fallback to DEFAULT_SHOULDER_WIDTH');
    shoulderWidth = DEFAULT_SHOULDER_WIDTH;
  }
  if (shoulderWidth < EPSILON) {
    log.warn('shoulder width too small, fallback to DEFAULT_SHOULDER_WIDTH');
    shoulderWidth = DEFAULT_SHOULDER_WIDTH;
  }
  const torsoRadius = shoulderWidth * TORSO_RADIUS_FACTOR;

  // ===== 头部球：center = head；radius = |head - neck| × 0.6（近似头骨长度）=====
  const headCenter: THREE.Vector3 = headPos ?? neckPos ?? torsoEnd.clone();
  if (!headPos) {
    log.warn(
      neckPos
        ? 'head bone not found, head center fallback to neck'
        : 'head/neck bones not found, head center fallback to torsoEnd',
    );
  }
  let headRadius: number;
  if (headPos && neckPos) {
    headRadius = headPos.distanceTo(neckPos) * HEAD_RADIUS_FACTOR;
  } else {
    headRadius = DEFAULT_HEAD_RADIUS;
  }
  if (headRadius < EPSILON) {
    log.warn('head radius too small, fallback to DEFAULT_HEAD_RADIUS');
    headRadius = DEFAULT_HEAD_RADIUS;
  }

  // ===== 手臂胶囊构建辅助 =====
  // 上臂：start = shoulder（缺失时 upperArm），end = lowerArm
  // 前臂：start = lowerArm，end = hand
  // 半径 = 骨骼长度 × ARM_RADIUS_FACTOR
  const buildArmCapsule = (
    side: 'left' | 'right',
    shoulderPos: THREE.Vector3 | null,
    upperArmPos: THREE.Vector3 | null,
    lowerArmPos: THREE.Vector3 | null,
    handPos: THREE.Vector3 | null,
  ): { upper: Capsule; forearm: Capsule } => {
    // 上臂 start = shoulder ?? upperArm ?? origin
    const upperStart: THREE.Vector3 = shoulderPos ?? upperArmPos ?? new THREE.Vector3();
    if (!shoulderPos) {
      log.warn(
        upperArmPos
          ? `${side} shoulder bone not found, upperArm start fallback to upperArm`
          : `${side} shoulder and upperArm bones not found, upperArm start fallback to origin`,
      );
    }
    // 肘部位置 = lowerArm（缺失时回退到 upperStart 副本，避免胶囊退化为点）
    const elbowPos: THREE.Vector3 = lowerArmPos ?? upperStart.clone();
    if (!lowerArmPos) {
      log.warn(`${side} lowerArm bone not found, upperArm end fallback to upperStart`);
    }
    // 前臂 end = hand（缺失时回退到 elbowPos 副本）
    const foreEnd: THREE.Vector3 = handPos ?? elbowPos.clone();
    if (!handPos) {
      log.warn(`${side} hand bone not found, forearm end fallback to elbowPos`);
    }

    const upperLen = upperStart.distanceTo(elbowPos);
    const foreLen = elbowPos.distanceTo(foreEnd);
    const upperRadius = upperLen > EPSILON ? upperLen * ARM_RADIUS_FACTOR : DEFAULT_ARM_RADIUS;
    const foreRadius = foreLen > EPSILON ? foreLen * ARM_RADIUS_FACTOR : DEFAULT_ARM_RADIUS;

    return {
      upper: { start: upperStart, end: elbowPos, radius: upperRadius },
      forearm: { start: elbowPos, end: foreEnd, radius: foreRadius },
    };
  };

  const leftArm = buildArmCapsule(
    'left', leftShoulderPos, leftUpperArmPos, leftLowerArmPos, leftHandPos,
  );
  const rightArm = buildArmCapsule(
    'right', rightShoulderPos, rightUpperArmPos, rightLowerArmPos, rightHandPos,
  );

  return {
    torso: { start: torsoStart, end: torsoEnd, radius: torsoRadius },
    head: { center: headCenter, radius: headRadius },
    upperArms: { left: leftArm.upper, right: rightArm.upper },
    forearms: { left: leftArm.forearm, right: rightArm.forearm },
  };
}

// ===== 穿透检测 =====

/** 点到线段最近点距离及最近点 */
function distancePointToSegment(
  p: THREE.Vector3,
  a: THREE.Vector3,
  b: THREE.Vector3,
): { dist: number; closest: THREE.Vector3 } {
  const ab = new THREE.Vector3().subVectors(b, a);
  const abLenSq = ab.lengthSq();
  // 退化情况：a == b，直接返回到 a 的距离
  if (abLenSq < EPSILON) {
    const closest = a.clone();
    return { dist: p.distanceTo(closest), closest };
  }
  // t = clamp(dot(p-a, ab) / |ab|^2, 0, 1)
  const t = THREE.MathUtils.clamp(
    new THREE.Vector3().subVectors(p, a).dot(ab) / abLenSq,
    0,
    1,
  );
  // closest = a + ab * t
  const closest = new THREE.Vector3().copy(a).addScaledVector(ab, t);
  return { dist: p.distanceTo(closest), closest };
}

/** 点是否在胶囊内（到轴线距离 < 半径） */
export function isInsideCapsule(p: THREE.Vector3, cap: Capsule): boolean {
  const { dist } = distancePointToSegment(p, cap.start, cap.end);
  return dist < cap.radius;
}

/** 点是否在球内 */
export function isInsideSphere(p: THREE.Vector3, s: Sphere): boolean {
  return p.distanceTo(s.center) < s.radius;
}

/** 点是否在躯干内 */
export function isInsideTorso(p: THREE.Vector3, vol: BodyVolume): boolean {
  return isInsideCapsule(p, vol.torso);
}

/** 点是否在头部内 */
export function isInsideHead(p: THREE.Vector3, vol: BodyVolume): boolean {
  return isInsideSphere(p, vol.head);
}

/** 点是否在任何手臂包络内（用于双手互穿检测） */
export function isInsideAnyArm(p: THREE.Vector3, vol: BodyVolume): boolean {
  return (
    isInsideCapsule(p, vol.upperArms.left) ||
    isInsideCapsule(p, vol.upperArms.right) ||
    isInsideCapsule(p, vol.forearms.left) ||
    isInsideCapsule(p, vol.forearms.right)
  );
}

// ===== 投影 =====

/** 获取与 axis 垂直的任意单位向量（用于点在轴线上时的法线方向） */
function getPerpendicular(axis: THREE.Vector3, out: THREE.Vector3): THREE.Vector3 {
  // 先尝试 (1,0,0)，减去其在 axis 上的分量得到垂直分量
  out.set(1, 0, 0).addScaledVector(axis, -out.dot(axis));
  if (out.lengthSq() < EPSILON) {
    // axis 与 (1,0,0) 平行，改用 (0,1,0)
    out.set(0, 1, 0).addScaledVector(axis, -out.dot(axis));
  }
  return out.normalize();
}

/**
 * 沿最近外法线把点投影到包络表面（保留切向分量，仅推出穿透深度）。
 * 优先级：躯干 > 头部（手部动作更多穿入躯干；当前未处理手臂包络投影）。
 * 若点不在任何包络内，返回原点的拷贝（不修改输入）。
 */
export function projectToSurface(p: THREE.Vector3, vol: BodyVolume): THREE.Vector3 {
  // 优先躯干胶囊
  if (isInsideCapsule(p, vol.torso)) {
    const { closest } = distancePointToSegment(p, vol.torso.start, vol.torso.end);
    // 法线方向 = p - closest（指向体外）
    const normal = new THREE.Vector3().subVectors(p, closest);
    if (normal.lengthSq() < EPSILON) {
      // p 在轴线上：用垂直轴线的任意方向
      const axis = new THREE.Vector3()
        .subVectors(vol.torso.end, vol.torso.start)
        .normalize();
      getPerpendicular(axis, normal);
    } else {
      normal.normalize();
    }
    // 投影点 = closest + normal × radius
    return closest.clone().addScaledVector(normal, vol.torso.radius);
  }

  // 其次头部球
  if (isInsideSphere(p, vol.head)) {
    // 法线方向 = p - center（指向体外）
    const normal = new THREE.Vector3().subVectors(p, vol.head.center);
    if (normal.lengthSq() < EPSILON) {
      // p 在球心：用任意方向（取 (0,1,0)）
      normal.set(0, 1, 0);
    } else {
      normal.normalize();
    }
    // 投影点 = center + normal × radius
    return vol.head.center.clone().addScaledVector(normal, vol.head.radius);
  }

  // 不在任何包络内：返回原点的拷贝（不修改输入）
  return p.clone();
}
