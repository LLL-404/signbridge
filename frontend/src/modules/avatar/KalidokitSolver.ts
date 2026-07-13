/**
 * @file KalidokitSolver.ts
 * @description Kalidokit IK 解算器
 *
 * 将 MediaPipe PoseEstimate 关键点通过 Kalidokit 转换为 VRM 骨骼旋转，
 * 输出经 QuaternionSmoother 平滑的旋转数据，供 VRMAdapter.applyRealtimePose 使用。
 *
 * 数据流：
 *   PoseEstimate (Keypoint[]) ──Kalidokit──▶ 关节旋转 ──QuaternionSmoother──▶ VRMBoneRotations
 *
 * 说明：
 *   - Kalidokit v1.1.5 的 Pose.solve 仅返回 Hips / Spine / 双臂 / 双腿，
 *     不提供 Chest / Neck / Head / Shoulder，故只映射实际可用的关节。
 *   - 腿部在 VRMAdapter 中未映射，设置 enableLegs=false 跳过腿部计算以节省开销。
 */
import * as Kalidokit from 'kalidokit';
import { QuaternionSmoother } from './Smoother';
import type { PoseEstimate, Keypoint, HandLandmarks } from '../recognition/PoseEstimator';
import { logger } from '@/modules/debug/logger';

const log = logger.module('Kalidokit');

/** VRM 骨骼旋转映射（骨骼名 → 欧拉角 XYZ 弧度） */
export type VRMBoneRotations = Map<string, { x: number; y: number; z: number }>;

/** KalidokitSolver 构造选项 */
export interface KalidokitSolverOptions {
  /**
   * 是否镜像左右手。
   * 自拍镜像视角下，MediaPipe 的 handedness 与 VRM 左右相反（用户右手被标为 "Left"），
   * 此时需交换 handedness 再传给 Kalidokit。默认 true（适配镜像摄像头）。
   */
  mirrorHands?: boolean;
  /** QuaternionSmoother 的最小截止频率，值越大越平滑 */
  smootherMinCutoff?: number;
  /** QuaternionSmoother 的速度系数，值越大对快速运动响应越好 */
  smootherBeta?: number;
}

/**
 * Kalidokit IK 解算器
 *
 * 用法：
 * ```ts
 * const solver = new KalidokitSolver();
 * const rotations = solver.solve(estimate);
 * vrmAdapter.applyRealtimePose(rotations);
 * ```
 */
export class KalidokitSolver {
  private readonly smoother: QuaternionSmoother;
  private readonly mirrorHands: boolean;
  /** 上次成功解算的结果（解算失败时回退，避免画面跳变） */
  private lastValid: VRMBoneRotations = new Map();

  constructor(options: KalidokitSolverOptions = {}) {
    this.smoother = new QuaternionSmoother(options.smootherMinCutoff, options.smootherBeta);
    this.mirrorHands = options.mirrorHands ?? true;
  }

  /**
   * 将 PoseEstimate 解算为 VRM 骨骼旋转
   * @param estimate PoseEstimator 输出的全身姿态估计
   * @returns VRM 骨骼名 → 旋转欧拉角（弧度）的映射
   */
  solve(estimate: PoseEstimate): VRMBoneRotations {
    try {
      const result: VRMBoneRotations = new Map();
      const ts = estimate.timestamp;

      this.solveBody(estimate.body, ts, result);
      this.solveHand(estimate.leftHand, ts, result);
      this.solveHand(estimate.rightHand, ts, result);

      // 全部解算失败时回退到上次有效结果，避免画面跳变
      if (result.size === 0) {
        return this.lastValid;
      }
      this.lastValid = result;
      return result;
    } catch (err) {
      log.error('解算异常', err);
      return this.lastValid;
    }
  }

  /** 重置平滑器（在动作切换时调用，避免过渡延迟） */
  reset(): void {
    this.smoother.reset();
    this.lastValid = new Map();
  }

  /**
   * 身体姿态解算
   *
   * Keypoint 结构（{x,y,z,visibility?}）兼容 Kalidokit 输入，无需额外转换，
   * 直接传 body 引用即可（mediapipe runtime 不会修改输入数组）。
   * 注意：Kalidokit 的 calcHips 运行时会读取 lm2d 的 z 分量，故 lm3d/lm2d 传同一份 body。
   */
  private solveBody(body: Keypoint[], timestamp: number, out: VRMBoneRotations): void {
    // MediaPipe Pose 共 33 个关键点，不足则无法解算
    if (!body || body.length < 33) return;

    const poseRig = Kalidokit.Pose.solve(body, body, {
      runtime: 'mediapipe',
      enableLegs: false,
    });
    if (!poseRig) return;

    // Hips 的旋转位于 .rotation 字段（Vector | undefined）
    const hipsRot = poseRig.Hips?.rotation;
    if (hipsRot) {
      out.set('hips', this.smoother.smooth('hips', hipsRot, timestamp));
    }
    // Spine / 双臂直接为 {x,y,z} 欧拉角（弧度）
    this.smoothAndSet(out, 'spine', poseRig.Spine, timestamp);
    this.smoothAndSet(out, 'leftUpperArm', poseRig.LeftUpperArm, timestamp);
    this.smoothAndSet(out, 'rightUpperArm', poseRig.RightUpperArm, timestamp);
    this.smoothAndSet(out, 'leftLowerArm', poseRig.LeftLowerArm, timestamp);
    this.smoothAndSet(out, 'rightLowerArm', poseRig.RightLowerArm, timestamp);
  }

  /**
   * 手部姿态解算
   *
   * Kalidokit.Hand.solve 返回的手指骨骼名为 PascalCase（如 "RightThumbProximal"），
   * VRM 标准骨骼名为 camelCase（如 "rightThumbProximal"），转换首字母即可。
   * 不匹配的骨骼（如 Wrist、ThumbIntermediate）会被 VRMAdapter.applyRealtimePose
   * 内部的 getNormalizedBoneNode 返回 null 而安全跳过。
   */
  private solveHand(hand: HandLandmarks | null, timestamp: number, out: VRMBoneRotations): void {
    // 手部 21 个关键点，不足则跳过
    if (!hand || hand.landmarks.length < 21) return;

    // 镜像处理：自拍镜像下 MediaPipe 的 handedness 与 VRM 左右相反
    const side: Kalidokit.Side = this.mirrorHands
      ? hand.handedness === 'Left'
        ? 'Right'
        : 'Left'
      : hand.handedness;

    // Keypoint 结构兼容 Kalidokit Results（{x,y,z}），直接传引用
    const handRig = Kalidokit.Hand.solve(hand.landmarks, side);
    if (!handRig) return;

    for (const [kaliKey, rot] of Object.entries(handRig)) {
      // PascalCase → camelCase：RightThumbProximal → rightThumbProximal
      const vrmKey = kaliKey.charAt(0).toLowerCase() + kaliKey.slice(1);
      out.set(vrmKey, this.smoother.smooth(vrmKey, rot, timestamp));
    }
  }

  /**
   * 平滑并写入结果（旋转值缺失时跳过）
   */
  private smoothAndSet(
    out: VRMBoneRotations,
    vrmBoneName: string,
    rotation: { x: number; y: number; z: number } | undefined,
    timestamp: number,
  ): void {
    if (!rotation) return;
    out.set(vrmBoneName, this.smoother.smooth(vrmBoneName, rotation, timestamp));
  }
}
