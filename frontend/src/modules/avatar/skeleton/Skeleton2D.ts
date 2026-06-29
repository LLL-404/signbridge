// 2D 虚拟人骨骼系统：使用 Canvas 2D API 渲染
import type { BonePose, HandPose, Vec3 } from '@/types/avatar';
import { HandShape, FacialExpression, HeadMovement } from '@/types/sign';

/** 2D 投影：将 3D 坐标投影到 2D 画布坐标 */
function project(pos: Vec3, centerX: number, centerY: number, scale: number): { x: number; y: number } {
  return {
    x: centerX + pos.x * scale,
    y: centerY - pos.y * scale, // Y 轴翻转（画布 Y 向下）
  };
}

/** 手形 → 手指弯曲角度（弧度），每根手指3关节 */
const HAND_SHAPE_ANGLES: Record<string, number[]> = {
  [HandShape.OPEN_5]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  [HandShape.FIST_A]: [0.5, 1.0, 1.0, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5],
  [HandShape.INDEX_POINT]: [0.3, 0.7, 0.7, 0, 0, 0, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5],
  [HandShape.V_SHAPE]: [0.3, 0.7, 0.7, 0, 0, 0, 0, 0, 0, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5],
  [HandShape.FLAT_B]: [0, 0.17, 0.17, 0, 0.09, 0.09, 0, 0.09, 0.09, 0, 0.09, 0.09, 0, 0.09, 0.09],
  [HandShape.THUMB_UP]: [0, 0, 0, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5],
  [HandShape.C_SHAPE]: [0.35, 0.5, 0.5, 0.5, 0.7, 0.5, 0.5, 0.7, 0.5, 0.5, 0.7, 0.5, 0.5, 0.7, 0.5],
  [HandShape.O_SHAPE]: [0.7, 0.87, 0.87, 1.0, 1.2, 1.0, 1.0, 1.2, 1.0, 1.0, 1.2, 1.0, 1.0, 1.2, 1.0],
  [HandShape.THREE]: [0, 0, 0, 0, 0, 0, 0, 0, 0, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5],
  [HandShape.HORNS]: [0.3, 0.7, 0.7, 0, 0, 0, 1.5, 1.7, 1.5, 1.5, 1.7, 1.5, 0, 0, 0],
};

/** 手指名称 */
const FINGER_NAMES = ['thumb', 'index', 'middle', 'ring', 'pinky'];
/** 手指在手掌上的根部偏移（相对于手腕，x 为水平偏移，y 为垂直偏移） */
const FINGER_ROOTS: Record<string, { x: number; y: number }> = {
  thumb: { x: -0.04, y: -0.02 },
  index: { x: -0.02, y: -0.06 },
  middle: { x: 0, y: -0.065 },
  ring: { x: 0.02, y: -0.06 },
  pinky: { x: 0.04, y: -0.05 },
};
/** 手指节段长度 */
const FINGER_LENGTHS: Record<string, [number, number, number]> = {
  thumb: [0.06, 0.05, 0.04],
  index: [0.07, 0.06, 0.05],
  middle: [0.075, 0.065, 0.05],
  ring: [0.07, 0.06, 0.045],
  pinky: [0.06, 0.05, 0.04],
};

/** 2D 骨骼系统类 */
export class Skeleton2D {
  private ctx: CanvasRenderingContext2D;
  private width: number;
  private height: number;

  constructor(ctx: CanvasRenderingContext2D, width = 400, height = 500) {
    this.ctx = ctx;
    this.width = width;
    this.height = height;
  }

  /** 渲染一帧 */
  render(pose: BonePose): void {
    const ctx = this.ctx;
    const cx = this.width / 2;
    const cy = this.height * 0.55;
    const scale = this.height * 0.35; // 缩放因子

    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, this.width, this.height);

    // 计算各关节 2D 位置（基于姿态中的位置偏移叠加中性姿态基准）
    const joints = this.computeJoints(pose, cx, cy, scale);

    // 绘制身体
    this.drawBody(joints);
    // 绘制左臂
    this.drawArm(joints, 'left');
    // 绘制右臂
    this.drawArm(joints, 'right');
    // 绘制左手
    this.drawHand(joints, 'left', pose.left_hand);
    // 绘制右手
    this.drawHand(joints, 'right', pose.right_hand);
    // 绘制头部（含表情）
    this.drawHead(joints, pose.expression, pose.head_movement);
  }

  /** 计算各关节的 2D 位置 */
  private computeJoints(pose: BonePose, cx: number, cy: number, scale: number) {
    return {
      spine: project(pose.spine.position, cx, cy, scale),
      chest: project(pose.chest.position, cx, cy, scale),
      neck: project(pose.neck.position, cx, cy, scale),
      head: project(pose.head.position, cx, cy, scale),
      leftShoulder: project(pose.left_shoulder.position, cx, cy, scale),
      leftElbow: project(pose.left_elbow.position, cx, cy, scale),
      leftWrist: project(pose.left_wrist.position, cx, cy, scale),
      rightShoulder: project(pose.right_shoulder.position, cx, cy, scale),
      rightElbow: project(pose.right_elbow.position, cx, cy, scale),
      rightWrist: project(pose.right_wrist.position, cx, cy, scale),
    };
  }

  /** 绘制躯干 */
  private drawBody(j: ReturnType<Skeleton2D['computeJoints']>): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#4a90d9';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';

    // 脊柱
    ctx.beginPath();
    ctx.moveTo(j.spine.x, j.spine.y);
    ctx.lineTo(j.chest.x, j.chest.y);
    ctx.lineTo(j.neck.x, j.neck.y);
    ctx.stroke();

    // 肩部连线
    ctx.beginPath();
    ctx.moveTo(j.leftShoulder.x, j.leftShoulder.y);
    ctx.lineTo(j.rightShoulder.x, j.rightShoulder.y);
    ctx.stroke();
  }

  /** 绘制手臂 */
  private drawArm(j: ReturnType<Skeleton2D['computeJoints']>, side: 'left' | 'right'): void {
    const ctx = this.ctx;
    ctx.strokeStyle = '#5a9ee0';
    ctx.lineWidth = 6;
    ctx.lineCap = 'round';

    const shoulder = side === 'left' ? j.leftShoulder : j.rightShoulder;
    const elbow = side === 'left' ? j.leftElbow : j.rightElbow;
    const wrist = side === 'left' ? j.leftWrist : j.rightWrist;

    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(wrist.x, wrist.y);
    ctx.stroke();

    // 关节点
    ctx.fillStyle = '#6ab0e8';
    ctx.beginPath();
    ctx.arc(elbow.x, elbow.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 绘制手部（手掌+手指） */
  private drawHand(j: ReturnType<Skeleton2D['computeJoints']>, side: 'left' | 'right', hand: HandPose): void {
    const ctx = this.ctx;
    const wrist = side === 'left' ? j.leftWrist : j.rightWrist;
    const scale = this.height * 0.35;
    const angles = HAND_SHAPE_ANGLES[hand.shape] ?? HAND_SHAPE_ANGLES[HandShape.OPEN_5];

    // 手掌
    ctx.fillStyle = '#6ab0e8';
    ctx.beginPath();
    ctx.ellipse(wrist.x, wrist.y - 3, 8, 6, 0, 0, Math.PI * 2);
    ctx.fill();

    // 手指
    ctx.strokeStyle = '#6ab0e8';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';

    for (let fi = 0; fi < FINGER_NAMES.length; fi++) {
      const fingerName = FINGER_NAMES[fi];
      const root = FINGER_ROOTS[fingerName];
      const lengths = FINGER_LENGTHS[fingerName];
      const palmDir = side === 'left' ? -1 : 1;

      // 手指根部位置（相对于手腕）
      let px = wrist.x + root.x * scale * palmDir;
      let py = wrist.y - root.y * scale;

      ctx.beginPath();
      ctx.moveTo(px, py);

      // P1 修复：正确的 2D 旋转变换
      // 累积弯曲角度，每次屈曲绕当前指节根部旋转
      // 注意：初始方向为向上（垂直向上），屈曲时绕 Z 轴（垂直屏幕向内）顺时针旋转
      let cumulativeAngle = 0;
      for (let ji = 0; ji < 3; ji++) {
        cumulativeAngle += angles[fi * 3 + ji];
        // 正确的 2D 旋转：初始方向向量 (0, -1)，旋转后：
        const cosA = Math.cos(cumulativeAngle);
        const sinA = Math.sin(cumulativeAngle);
        const rotDirX = -sinA;  // = cos*0 - sin*(-1) = sin
        const rotDirY = -cosA; // = sin*0 + cos*(-1) = -cos

        const segLen = lengths[ji] * scale;
        px += rotDirX * segLen;
        py += rotDirY * segLen;
        ctx.lineTo(px, py);
      }
      ctx.stroke();

      // 指尖圆点
      ctx.fillStyle = '#7ac0f0';
      ctx.beginPath();
      ctx.arc(px, py, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 绘制头部（含面部表情） */
  private drawHead(j: ReturnType<Skeleton2D['computeJoints']>, expression: FacialExpression, headMovement: HeadMovement): void {
    const ctx = this.ctx;
    const headRadius = 18;

    // 头部旋转偏移
    let headOffsetX = 0;
    if (headMovement === HeadMovement.TILT_LEFT) headOffsetX = -3;
    if (headMovement === HeadMovement.TILT_RIGHT) headOffsetX = 3;

    // 头部
    ctx.fillStyle = '#4a90d9';
    ctx.beginPath();
    ctx.arc(j.head.x + headOffsetX, j.head.y, headRadius, 0, Math.PI * 2);
    ctx.fill();

    // 面部表情
    const ex = j.head.x + headOffsetX;
    const ey = j.head.y;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;

    // 眼睛
    const eyeY = ey - 3;
    if (expression === FacialExpression.HAPPY || expression === FacialExpression.QUESTION) {
      // 弯眼（笑眼/挑眉）
      ctx.beginPath();
      ctx.arc(ex - 6, eyeY, 3, Math.PI, 0, false);
      ctx.arc(ex + 6, eyeY, 3, Math.PI, 0, false);
      ctx.stroke();
    } else if (expression === FacialExpression.ANGRY || expression === FacialExpression.NEGATIVE) {
      // 皱眉（斜线眼）
      ctx.beginPath();
      ctx.moveTo(ex - 8, eyeY - 2);
      ctx.lineTo(ex - 4, eyeY + 1);
      ctx.moveTo(ex + 4, eyeY + 1);
      ctx.lineTo(ex + 8, eyeY - 2);
      ctx.stroke();
    } else {
      // 正常圆眼
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(ex - 6, eyeY, 2, 0, Math.PI * 2);
      ctx.arc(ex + 6, eyeY, 2, 0, Math.PI * 2);
      ctx.fill();
    }

    // 嘴巴
    const mouthY = ey + 6;
    ctx.beginPath();
    if (expression === FacialExpression.HAPPY) {
      ctx.arc(ex, mouthY - 2, 5, 0, Math.PI, false);
    } else if (expression === FacialExpression.SAD) {
      ctx.arc(ex, mouthY + 3, 5, Math.PI, 0, false);
    } else if (expression === FacialExpression.QUESTION || expression === FacialExpression.SURPRISED) {
      ctx.arc(ex, mouthY, 3, 0, Math.PI * 2);
    } else if (expression === FacialExpression.NEGATIVE) {
      ctx.moveTo(ex - 5, mouthY + 1);
      ctx.lineTo(ex + 5, mouthY - 1);
    } else {
      ctx.moveTo(ex - 5, mouthY);
      ctx.lineTo(ex + 5, mouthY);
    }
    ctx.stroke();
  }

  /** 重置到中性姿态 */
  resetToNeutral(): void {
    // 2D 渲染无状态，无需重置
  }
}
