// 识别相关类型定义

/** 单个手部关键点（三维坐标） */
export interface HandKeypoint {
  x: number;
  y: number;
  z: number;
}

/** 单帧关键点（21 点 × 3 坐标 = 63 维/手） */
export interface FrameKeypoints {
  left_hand: HandKeypoint[] | null; // 21 个点，未检测到时为 null
  right_hand: HandKeypoint[] | null;
  timestamp: number;
}

/** 关键点序列 */
export interface KeypointSequence {
  frames: FrameKeypoints[];
  fps: number;
}

/** 归一化后的序列（用于模型输入） */
export interface NormalizedSequence {
  data: number[]; // [T, 126] 展平
  length: number; // T
}

/** 分类结果 */
export interface ClassificationResult {
  gloss_id: string;
  chinese: string;
  confidence: number;
  all_probabilities?: { gloss_id: string; probability: number }[];
}

/** 识别状态 */
export type RecognitionStatus =
  | 'idle'
  | 'waiting'
  | 'capturing'
  | 'recognizing'
  | 'result'
  | 'uncertain';

/** 跟练评分结果 */
export interface PracticeScore {
  total_score: number; // 0-100
  handshape_score: number;
  position_score: number;
  motion_score: number;
  feedback: string;
  aligned_frames: {
    user: FrameKeypoints;
    standard: FrameKeypoints;
    similarity: number;
  }[];
}
