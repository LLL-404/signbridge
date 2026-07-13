// One-Euro Filter — 自适应低通滤波器
// 用于平滑骨骼旋转数据，消除帧间抖动（jitter）
//
// 原理：当信号变化快时降低截止频率（减少平滑），变化慢时提高截止频率（增加平滑）
// 参考：Casie et al., "One Euro Filter" (CHI 2012)
//
// 参数：
//   minCutoff: 最小截止频率（Hz），值越大越平滑
//   beta: 速度系数，值越大对快速运动响应越好
//   dCutoff: 速度信号的截止频率（Hz）
import * as THREE from 'three';

/** 单值 One-Euro Filter */
export class OneEuroFilter {
  private minCutoff: number;
  private beta: number;
  private dCutoff: number;
  private lastValue: number;
  private lastTimestamp: number;
  private lastDerivative: number;
  private initialized: boolean;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.minCutoff = minCutoff;
    this.beta = beta;
    this.dCutoff = dCutoff;
    this.lastValue = 0;
    this.lastTimestamp = 0;
    this.lastDerivative = 0;
    this.initialized = false;
  }

  /** 低通滤波步骤 */
  private lowPass(cutoff: number, value: number, prevValue: number, dt: number): number {
    if (dt <= 0) return value;
    const tau = 1 / (2 * Math.PI * cutoff);
    const alpha = tau / (tau + dt);
    return prevValue + alpha * (value - prevValue);
  }

  /** 滤波 */
  filter(value: number, timestamp: number): number {
    if (!this.initialized) {
      this.lastValue = value;
      this.lastTimestamp = timestamp;
      this.lastDerivative = 0;
      this.initialized = true;
      return value;
    }

    const dt = (timestamp - this.lastTimestamp) / 1000; // 转秒
    if (dt <= 0) return this.lastValue;

    // 估算速度（导数）
    const derivative = (value - this.lastValue) / dt;
    const filteredDerivative = this.lowPass(this.dCutoff, derivative, this.lastDerivative, dt);

    // 自适应截止频率：速度越快，截止频率越高（平滑越少）
    const cutoff = this.minCutoff + this.beta * Math.abs(filteredDerivative);

    // 对值做低通滤波
    const filteredValue = this.lowPass(cutoff, value, this.lastValue, dt);

    this.lastValue = filteredValue;
    this.lastTimestamp = timestamp;
    this.lastDerivative = filteredDerivative;

    return filteredValue;
  }

  /** 重置滤波器 */
  reset(): void {
    this.initialized = false;
    this.lastValue = 0;
    this.lastTimestamp = 0;
    this.lastDerivative = 0;
  }
}

/** Vec3 One-Euro Filter */
export class Vec3OneEuroFilter {
  private x: OneEuroFilter;
  private y: OneEuroFilter;
  private z: OneEuroFilter;

  constructor(minCutoff = 1.0, beta = 0.007, dCutoff = 1.0) {
    this.x = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.y = new OneEuroFilter(minCutoff, beta, dCutoff);
    this.z = new OneEuroFilter(minCutoff, beta, dCutoff);
  }

  filter(v: { x: number; y: number; z: number }, timestamp: number): { x: number; y: number; z: number } {
    return {
      x: this.x.filter(v.x, timestamp),
      y: this.y.filter(v.y, timestamp),
      z: this.z.filter(v.z, timestamp),
    };
  }

  reset(): void {
    this.x.reset();
    this.y.reset();
    this.z.reset();
  }
}

/**
 * 骨骼旋转平滑器：对每个关节维护独立的 One-Euro Filter
 * @deprecated 使用 QuaternionSmoother 代替
 */
export class BoneSmoother {
  private filters: Map<string, Vec3OneEuroFilter> = new Map();
  private minCutoff: number;
  private beta: number;

  constructor(minCutoff = 1.5, beta = 0.01) {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  /** 平滑单个关节旋转 */
  smooth(boneName: string, rotation: { x: number; y: number; z: number }, timestamp: number): { x: number; y: number; z: number } {
    let f = this.filters.get(boneName);
    if (!f) {
      f = new Vec3OneEuroFilter(this.minCutoff, this.beta);
      this.filters.set(boneName, f);
    }
    return f.filter(rotation, timestamp);
  }

  /** 重置所有滤波器（在动作切换时调用，避免过渡延迟） */
  reset(): void {
    for (const f of this.filters.values()) {
      f.reset();
    }
  }
}

/**
 * 球面线性插值（SLERP）两个 Vec3 旋转
 * @deprecated 使用 slerpQuat 代替
 */
export function slerpRotation(
  a: { x: number; y: number; z: number },
  b: { x: number; y: number; z: number },
  t: number,
): { x: number; y: number; z: number } {
  // 简单线性插值（对欧拉角足够，因为帧间变化小）
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
  };
}

/**
 * 球面线性插值（SLERP）两个四元数
 * 使用 THREE.Quaternion.slerp 实现，保证旋转插值的稳定性
 *
 * @param a 起始四元数
 * @param b 目标四元数
 * @param t 插值因子，范围 [0, 1]
 * @returns 插值后的四元数（新实例）
 */
export function slerpQuat(a: THREE.Quaternion, b: THREE.Quaternion, t: number): THREE.Quaternion {
  // THREE.Quaternion.slerp 是静态方法，返回新四元数，不修改入参
  return new THREE.Quaternion().slerpQuaternions(a, b, t);
}

/**
 * 四元数骨骼旋转平滑器
 *
 * 与 BoneSmoother（基于欧拉角分量滤波）不同，本类对四元数的
 * x/y/z/w 四个分量分别维护独立的 One-Euro Filter，并在每次滤波后
 * 归一化结果，保证四元数始终是单位四元数。
 *
 * 优点：
 *   - 避免欧拉角的万向锁问题
 *   - 旋转插值在球面上进行，视觉上更自然
 *   - 对任意旋转顺序的输入都保持一致性
 */
export class QuaternionSmoother {
  /** 每个骨骼对应的 4 分量滤波器组 */
  private filters: Map<string, [OneEuroFilter, OneEuroFilter, OneEuroFilter, OneEuroFilter]> = new Map();
  private minCutoff: number;
  private beta: number;

  constructor(minCutoff = 1.5, beta = 0.01) {
    this.minCutoff = minCutoff;
    this.beta = beta;
  }

  /** 获取或创建指定骨骼的 4 分量滤波器组 */
  private getFilters(boneName: string): [OneEuroFilter, OneEuroFilter, OneEuroFilter, OneEuroFilter] {
    let f = this.filters.get(boneName);
    if (!f) {
      // 分别对应四元数的 x、y、z、w 分量
      f = [
        new OneEuroFilter(this.minCutoff, this.beta),
        new OneEuroFilter(this.minCutoff, this.beta),
        new OneEuroFilter(this.minCutoff, this.beta),
        new OneEuroFilter(this.minCutoff, this.beta),
      ];
      this.filters.set(boneName, f);
    }
    return f;
  }

  /**
   * 平滑四元数旋转
   *
   * @param boneName 骨骼名称
   * @param quat 输入四元数
   * @param timestamp 时间戳（毫秒）
   * @returns 平滑后的四元数（新实例）
   */
  smoothQuaternion(boneName: string, quat: THREE.Quaternion, timestamp: number): THREE.Quaternion {
    const [fx, fy, fz, fw] = this.getFilters(boneName);
    // 对四元数 4 个分量分别滤波
    const x = fx.filter(quat.x, timestamp);
    const y = fy.filter(quat.y, timestamp);
    const z = fz.filter(quat.z, timestamp);
    const w = fw.filter(quat.w, timestamp);
    // 归一化以保证单位四元数（分量独立滤波会破坏模长）
    const out = new THREE.Quaternion(x, y, z, w);
    return out.normalize();
  }

  /**
   * 平滑欧拉角旋转（内部转换为四元数滤波后返回欧拉角）
   *
   * @param boneName 骨骼名称
   * @param rotation 欧拉角输入（弧度，XYZ 顺序）
   * @param timestamp 时间戳（毫秒）
   * @returns 平滑后的欧拉角（弧度，XYZ 顺序）
   */
  smooth(
    boneName: string,
    rotation: { x: number; y: number; z: number },
    timestamp: number,
  ): { x: number; y: number; z: number } {
    // 欧拉角 -> 四元数（使用 XYZ 顺序，与 Three.js 默认一致）
    const quat = new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rotation.x, rotation.y, rotation.z, 'XYZ'),
    );
    const smoothed = this.smoothQuaternion(boneName, quat, timestamp);
    // 四元数 -> 欧拉角
    const e = new THREE.Euler().setFromQuaternion(smoothed, 'XYZ');
    return { x: e.x, y: e.y, z: e.z };
  }

  /** 重置所有滤波器（在动作切换时调用，避免过渡延迟） */
  reset(): void {
    for (const f of this.filters.values()) {
      f[0].reset();
      f[1].reset();
      f[2].reset();
      f[3].reset();
    }
  }
}
