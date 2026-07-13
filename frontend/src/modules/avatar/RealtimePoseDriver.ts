/**
 * @file RealtimePoseDriver.ts
 * @description 实时姿态驱动器
 *
 * 连接 PoseEstimate → KalidokitSolver → VRMAdapter 的实时驱动管线。
 * 在渲染循环中每帧调用 update()，将摄像头追踪数据实时驱动 VRM 模型。
 *
 * 数据流：
 *   PoseEstimate ──KalidokitSolver──▶ VRMBoneRotations ──VRMAdapter.applyRealtimePose──▶ VRM 骨骼
 *
 * 与离线驱动路径（AvatarDriver + IKSolver）的关系：
 *   - 两条路径互斥，通过 setEnabled 切换
 *   - 切换时调用 reset() 清空平滑器状态，避免过渡跳变
 *   - 实时路径不经过 retarget/IK，旋转值由 Kalidokit 直接解算并经 QuaternionSmoother 平滑
 */
import { KalidokitSolver, type VRMBoneRotations } from './KalidokitSolver';
import type { VRMAdapter } from './VRMAdapter';
import type { PoseEstimate } from '../recognition/PoseEstimator';

/**
 * 实时姿态驱动器
 *
 * 用法：
 * ```ts
 * const driver = new RealtimePoseDriver();
 * driver.attach(vrmAdapter);
 * driver.setEnabled(true);
 * // 每帧调用：
 * driver.update(poseEstimate, deltaTime);
 * ```
 */
export class RealtimePoseDriver {
  private readonly solver: KalidokitSolver;
  private vrmAdapter: VRMAdapter | null = null;
  private enabled = false;

  constructor() {
    this.solver = new KalidokitSolver();
  }

  /** 绑定 VRM 适配器（在 VRM 加载完成后调用） */
  attach(adapter: VRMAdapter): void {
    this.vrmAdapter = adapter;
  }

  /** 解绑 */
  detach(): void {
    this.vrmAdapter = null;
    this.setEnabled(false);
  }

  /** 启用/禁用实时驱动；禁用时清空解算器状态，避免下次启用时残留旧值 */
  setEnabled(enabled: boolean): void {
    if (this.enabled === enabled) return;
    this.enabled = enabled;
    if (!enabled) {
      this.solver.reset();
    }
  }

  /** 当前是否启用 */
  isEnabled(): boolean {
    return this.enabled;
  }

  /**
   * 每帧更新（在渲染循环中调用）
   *
   * 顺序约定：
   *   1. vrm.update(deltaTime) — 先更新 spring bone / lookAt，确保 applyRealtimePose 写入的旋转在本帧生效
   *   2. KalidokitSolver.solve(poseEstimate) — 解算 + QuaternionSmoother 平滑
   *   3. vrmAdapter.applyRealtimePose(rotations) — 写入 VRM 骨骼
   *
   * @param poseEstimate 当前帧姿态估计（null 时跳过本帧）
   * @param deltaTime    帧间隔（秒）
   */
  update(poseEstimate: PoseEstimate | null, deltaTime: number): void {
    if (!this.enabled || !this.vrmAdapter || !poseEstimate) return;

    // 1. 先调用 vrm.update() 更新 spring bone
    this.vrmAdapter.update(deltaTime);

    // 2. Kalidokit 解算（内部已含 QuaternionSmoother 平滑）
    const rotations: VRMBoneRotations = this.solver.solve(poseEstimate);

    // 3. 应用到 VRM
    this.vrmAdapter.applyRealtimePose(rotations);
  }

  /** 重置（切换模式时调用，清空平滑器避免过渡延迟） */
  reset(): void {
    this.solver.reset();
  }
}
