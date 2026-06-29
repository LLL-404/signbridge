// DTW (Dynamic Time Warping) 时间对齐算法
// 对两个长度不同的时序序列进行最优对齐，用于跟练评分中的动作对比
// 加入 Sakoe-Chiba 带状约束，限制对齐路径不偏离对角线过远，提升性能并防止病态对齐

/** DTW 对齐结果 */
export interface DTWResult {
  /** 对齐后的帧对索引：[userIndex, standardIndex] */
  alignedPairs: [number, number][];
  /** 对齐路径上的总距离 */
  distance: number;
}

/** DTW 配置选项 */
export interface DTWOptions {
  /**
   * Sakoe-Chiba 窗口宽度（以对角线为中线，向两侧扩展的最大偏移）
   * 设为 0 或不传则自动取 max(n, m) * 0.3
   * 窗口越窄性能越好但容差越小，越宽容差越大但越慢
   */
  windowWidth?: number;
}

/**
 * DTW 动态时间规整算法
 * 通过动态规划找到两个序列之间的最优对齐路径
 * 支持长度不同的序列，对时间偏移和速度变化具有鲁棒性
 *
 * 性能优化：Sakoe-Chiba 带约束
 *   - 仅计算 |i - j| <= w 的格子，复杂度从 O(n·m) 降到 O(n·w)
 *   - 跟练场景用户与标准序列长度相近，w 取 30% 足够覆盖正常速度差异
 *   - 同时防止"病态对齐"（如把第 1 帧对齐到第 50 帧）
 */
export class DTW {
  private windowWidth: number | undefined;

  constructor(options: DTWOptions = {}) {
    this.windowWidth = options.windowWidth;
  }

  /**
   * 对齐用户序列和标准序列
   * @param userSeq 用户动作序列，每帧一个特征向量
   * @param standardSeq 标准动作序列，每帧一个特征向量
   * @returns 对齐帧对索引列表与总距离
   */
  align(userSeq: number[][], standardSeq: number[][]): DTWResult {
    const n = userSeq.length;
    const m = standardSeq.length;
    // 空序列无法对齐
    if (n === 0 || m === 0) {
      return { alignedPairs: [], distance: 0 };
    }

    // 累积距离矩阵：D[i][j] 表示对齐 userSeq[0..i-1] 与 standardSeq[0..j-1] 的最小代价
    const D = this.buildAccumulatedMatrix(userSeq, standardSeq);

    // 回溯最优路径
    const alignedPairs = this.backtrackPath(D, n, m);

    return { alignedPairs, distance: D[n][m] };
  }

  /**
   * 计算有效窗口宽度
   * 用户指定 >0 时用用户值，否则取 max(n,m) * 0.3 向上取整，最小为 1
   */
  private resolveWindow(n: number, m: number): number {
    if (this.windowWidth !== undefined && this.windowWidth > 0) {
      return this.windowWidth;
    }
    return Math.max(1, Math.ceil(Math.max(n, m) * 0.3));
  }

  /**
   * 构建累积距离矩阵（带 Sakoe-Chiba 窗口约束）
   * 递推公式：D[i][j] = cost(i,j) + min(D[i-1][j-1], D[i-1][j], D[i][j-1])
   * 仅计算 |i - j| <= w 的格子，其余保持 Infinity
   */
  private buildAccumulatedMatrix(userSeq: number[][], standardSeq: number[][]): number[][] {
    const n = userSeq.length;
    const m = standardSeq.length;
    const w = this.resolveWindow(n, m);
    // 初始化为 Infinity，D[0][0] = 0 作为起点
    const D: number[][] = Array.from({ length: n + 1 }, () =>
      new Array<number>(m + 1).fill(Infinity),
    );
    D[0][0] = 0;

    for (let i = 1; i <= n; i++) {
      // 窗口范围：j ∈ [max(1, i-w), min(m, i+w)]
      const jStart = Math.max(1, i - w);
      const jEnd = Math.min(m, i + w);
      for (let j = jStart; j <= jEnd; j++) {
        const cost = this.euclidean(userSeq[i - 1], standardSeq[j - 1]);
        D[i][j] = cost + Math.min(D[i - 1][j - 1], D[i - 1][j], D[i][j - 1]);
      }
    }
    return D;
  }

  /**
   * 从右下角回溯到左上角，得到最优对齐路径
   * 回溯时也只在窗口内移动（窗口外的格子为 Infinity，不会被选中）
   */
  private backtrackPath(D: number[][], n: number, m: number): [number, number][] {
    const pairs: [number, number][] = [];
    let i = n;
    let j = m;
    // 终点不可达（窗口过窄导致无路径），返回空
    if (!isFinite(D[i][j])) {
      return [];
    }
    while (i > 0 && j > 0) {
      pairs.push([i - 1, j - 1]);
      const diag = D[i - 1][j - 1];
      const up = D[i - 1][j];
      const left = D[i][j - 1];
      // 优先走对角线（一对一匹配），其次向上/向左
      if (diag <= up && diag <= left) {
        i--;
        j--;
      } else if (up <= left) {
        i--;
      } else {
        j--;
      }
    }
    // 回溯得到的是逆序路径，翻转后返回
    pairs.reverse();
    return pairs;
  }

  /**
   * 计算两个特征向量之间的欧几里得距离
   */
  private euclidean(a: number[], b: number[]): number {
    let sum = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      const diff = a[i] - b[i];
      sum += diff * diff;
    }
    return Math.sqrt(sum);
  }
}
