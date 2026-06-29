// 简化的逆向运动学（IK）求解器
// 基于 2 段 IK 解析解（肩-肘-腕），保证肘部自然弯曲不穿模
import type { Vec3 } from '@/types/avatar';

/** IK 求解结果 */
export interface IKResult {
  /** 肩部旋转角度（欧拉角，弧度） */
  shoulderRotation: Vec3;
  /** 肘部旋转角度（欧拉角，弧度） */
  elbowRotation: Vec3;
}

/** 向量工具：长度 */
function vecLength(v: Vec3): number {
  return Math.sqrt(v.x * v.x + v.y * v.y + v.z * v.z);
}

/** 向量减法 */
function vecSub(a: Vec3, b: Vec3): Vec3 {
  return { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
}

/** 限制角度在 [-π, π] */
function clampAngle(a: number): number {
  while (a > Math.PI) a -= 2 * Math.PI;
  while (a < -Math.PI) a += 2 * Math.PI;
  return a;
}

/**
 * 2 段 IK 求解
 * 给定肩部位置和腕部目标位置，以及上臂、前臂长度，计算肩部与肘部旋转
 * 使用余弦定理求肘部屈曲角，再根据目标方向计算肩部朝向
 *
 * @param shoulderPos 肩部位置
 * @param wristTargetPos 腕部目标位置
 * @param upperArmLength 上臂长度
 * @param forearmLength 前臂长度
 * @returns 肩部与肘部旋转角度（弧度）
 */
export function solve(
  shoulderPos: Vec3,
  wristTargetPos: Vec3,
  upperArmLength: number,
  forearmLength: number,
): IKResult {
  // 肩到腕的目标向量
  const targetVec = vecSub(wristTargetPos, shoulderPos);
  const targetDist = vecLength(targetVec);

  // 总臂长
  const totalLen = upperArmLength + forearmLength;
  // 限制目标距离不超过总臂长，避免无解
  const clampedDist = Math.min(targetDist, totalLen * 0.999);

  // 余弦定理求肘部屈曲角（肘内角）
  // cos(elbow) = (L1² + L2² - D²) / (2·L1·L2)
  const cosElbow =
    (upperArmLength * upperArmLength + forearmLength * forearmLength - clampedDist * clampedDist) /
    (2 * upperArmLength * forearmLength);
  const elbowInner = Math.acos(Math.max(-1, Math.min(1, cosElbow)));
  // 肘部屈曲角度（伸直为 0，完全屈曲为 π）
  const elbowFlex = Math.PI - elbowInner;

  // 肩部俯仰角（绕 X 轴）：基于目标在 YZ 平面的投影
  // 目标方向单位向量
  const dirY = targetDist > 1e-6 ? targetVec.y / targetDist : 0;
  const dirZ = targetDist > 1e-6 ? targetVec.z / targetDist : 0;

  // 肩部抬起角度（绕 Z 轴，控制手臂在矢状面内的抬起）
  // 当目标在身体侧方时，肩部需要外展
  const dirX = targetDist > 1e-6 ? targetVec.x / targetDist : 0;
  // 肩部外展角（绕 Z 轴）：手臂从下垂到水平外展
  const shoulderAbduct = Math.asin(Math.max(-1, Math.min(1, dirX)));

  // 肩部俯仰角（绕 X 轴）：手臂前后摆动
  // 默认手臂下垂（dirY=-1），抬起向上时 dirY 增大
  const shoulderPitch = Math.atan2(-dirY, Math.abs(dirZ) < 1e-6 ? 1e-6 : dirZ);

  // 肩部旋转（绕 Y 轴）：手臂内外旋，简化为 0
  const shoulderYaw = 0;

  return {
    shoulderRotation: {
      x: clampAngle(shoulderPitch),
      y: clampAngle(shoulderYaw),
      z: clampAngle(shoulderAbduct),
    },
    elbowRotation: {
      x: clampAngle(elbowFlex),
      y: 0,
      z: 0,
    },
  };
}
