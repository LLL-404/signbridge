/**
 * 连续手语识别器
 *
 * 从单帧手势升级到连续手势序列识别：
 * 1. 滑动窗口缓冲最近的手势（去抖）
 * 2. 状态机检测手势起止：稳定 → 过渡 → 稳定
 * 3. 手势组合词典：多个手势 → 中文词组
 *
 * 示例：
 *   用户做 "1" → "2" → "3"  → 输出 "1 2 3"
 *   用户做 "thumbs_up" → "victory" → 输出 "点赞 胜利"
 *   自定义组合： "point_up" + "open_palm" → "你好"（可在词典中配置）
 */

import type { ClassificationResult } from '@/types/recognition';

/** 单个识别到的手势事件 */
export interface GestureEvent {
  gloss_id: string;
  chinese: string;
  confidence: number;
  timestamp: number;
}

/** 手势组合规则 */
export interface GestureCombination {
  /** 手势 ID 序列 */
  sequence: string[];
  /** 组合后的中文输出 */
  chinese: string;
  /** 组合后的 emoji */
  emoji?: string;
}

/** 状态机状态 */
type SequenceState = 'idle' | 'stable' | 'transition';

/** 连续识别结果 */
export interface ContinuousResult {
  /** 当前稳定的手势序列 */
  sequence: GestureEvent[];
  /** 组合后的文本（如果有匹配的词典规则） */
  combinedText: string;
  /** 是否检测到新的手势加入序列 */
  newGesture: boolean;
}

/** 默认手势组合词典 */
const DEFAULT_COMBINATIONS: GestureCombination[] = [
  // 数字组合
  { sequence: ['csl_1', 'csl_0'], chinese: '10', emoji: '🔟' },
  { sequence: ['csl_2', 'csl_0'], chinese: '20', emoji: '2️⃣0️⃣' },
  // 常用词组（示例，可扩展）
  { sequence: ['thumbs_up', 'victory'], chinese: '做得好', emoji: '👍✌️' },
  { sequence: ['iloveyou', 'thumbs_up'], chinese: '爱你', emoji: '🤟👍' },
  { sequence: ['point_up', 'open_palm'], chinese: '你好', emoji: '☝️🖐' },
  { sequence: ['victory', 'victory'], chinese: '庆祝', emoji: '✌️✌️' },
];

/** 配置常量 */
const STABLE_FRAMES = 5; // 连续 N 帧相同手势才算稳定
const TRANSITION_FRAMES = 3; // 过渡帧数（无手势或变化中）
const MAX_SEQUENCE_LENGTH = 20; // 序列最大长度
const SEQUENCE_TIMEOUT_MS = 5000; // 序列超时（5 秒无新手势则清空）

/**
 * 连续手语识别器
 * 接收单帧识别结果，输出连续手势序列
 */
export class ContinuousRecognizer {
  /** 最近的手势 ID 缓冲（用于稳定性检测） */
  private recentGestures: string[] = [];
  /** 当前稳定的手势序列 */
  private sequence: GestureEvent[] = [];
  /** 当前状态 */
  private state: SequenceState = 'idle';
  /** 上一次输出的稳定手势 ID */
  private lastStableGesture = '';
  /** 过渡帧计数 */
  private transitionCount = 0;
  /** 上次手势时间戳 */
  private lastGestureTime = 0;
  /** 手势组合词典 */
  private combinations: GestureCombination[];

  constructor(combinations?: GestureCombination[]) {
    this.combinations = combinations ?? DEFAULT_COMBINATIONS;
  }

  /** 添加自定义组合规则 */
  addCombination(combo: GestureCombination): void {
    this.combinations.push(combo);
  }

  /** 处理一帧识别结果 */
  process(result: ClassificationResult | null): ContinuousResult {
    const now = Date.now();

    // 序列超时清空
    if (this.sequence.length > 0 && now - this.lastGestureTime > SEQUENCE_TIMEOUT_MS) {
      this.sequence = [];
      this.state = 'idle';
      this.lastStableGesture = '';
    }

    // 无手势结果
    if (!result || result.gloss_id === 'none' || result.gloss_id === 'unknown') {
      this.recentGestures = [];
      if (this.state === 'stable') {
        this.state = 'transition';
        this.transitionCount = 0;
      }
      this.transitionCount++;
      if (this.transitionCount >= TRANSITION_FRAMES && this.state === 'transition') {
        this.state = 'idle';
        this.lastStableGesture = '';
      }
      return {
        sequence: [...this.sequence],
        combinedText: this.combineSequence(),
        newGesture: false,
      };
    }

    // 记录最近手势
    this.recentGestures.push(result.gloss_id);
    if (this.recentGestures.length > STABLE_FRAMES) {
      this.recentGestures.shift();
    }

    // 检查稳定性：连续 STABLE_FRAMES 帧相同
    const isStable =
      this.recentGestures.length >= STABLE_FRAMES &&
      this.recentGestures.every((g) => g === this.recentGestures[0]);

    if (isStable) {
      const stableGesture = this.recentGestures[0];

      if (this.state !== 'stable' || stableGesture !== this.lastStableGesture) {
        // 新的稳定手势
        if (stableGesture !== this.lastStableGesture) {
          // 加入序列（避免连续重复）
          this.sequence.push({
            gloss_id: stableGesture,
            chinese: result.chinese,
            confidence: result.confidence,
            timestamp: now,
          });
          // 限制序列长度
          if (this.sequence.length > MAX_SEQUENCE_LENGTH) {
            this.sequence.shift();
          }
          this.lastStableGesture = stableGesture;
          this.lastGestureTime = now;
          this.state = 'stable';
          this.transitionCount = 0;

          return {
            sequence: [...this.sequence],
            combinedText: this.combineSequence(),
            newGesture: true,
          };
        }
      }
      this.state = 'stable';
      this.transitionCount = 0;
    } else {
      // 不稳定，可能是过渡
      if (this.state === 'stable') {
        this.state = 'transition';
        this.transitionCount = 0;
      }
      this.transitionCount++;
    }

    return {
      sequence: [...this.sequence],
      combinedText: this.combineSequence(),
      newGesture: false,
    };
  }

  /** 尝试组合序列为词组 */
  private combineSequence(): string {
    if (this.sequence.length === 0) return '';

    // 检查是否有匹配的组合规则
    for (const combo of this.combinations) {
      if (combo.sequence.length > this.sequence.length) continue;
      // 检查序列末尾是否匹配（逐元素比较，避免 JSON.stringify 分配）
      const offset = this.sequence.length - combo.sequence.length;
      let matched = true;
      for (let k = 0; k < combo.sequence.length; k++) {
        if (this.sequence[offset + k].gloss_id !== combo.sequence[k]) {
          matched = false;
          break;
        }
      }
      if (matched) {
        return combo.emoji ? `${combo.emoji} ${combo.chinese}` : combo.chinese;
      }
    }

    // 无匹配组合，直接拼接
    return this.sequence.map((g) => g.chinese).join(' ');
  }

  /** 获取当前序列 */
  getSequence(): GestureEvent[] {
    return [...this.sequence];
  }

  /** 清空序列 */
  clear(): void {
    this.sequence = [];
    this.recentGestures = [];
    this.state = 'idle';
    this.lastStableGesture = '';
    this.transitionCount = 0;
    this.lastGestureTime = 0;
  }

  /** 删除最后一个手势（撤销） */
  undoLast(): void {
    this.sequence.pop();
    this.lastStableGesture = this.sequence[this.sequence.length - 1]?.gloss_id ?? '';
  }
}
