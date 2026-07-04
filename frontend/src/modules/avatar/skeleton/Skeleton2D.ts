// 2D 虚拟人骨骼系统：使用 Canvas 2D API 渲染
import type { BonePose, HandPose, Vec3 } from '@/types/avatar';
import { HandShape, FacialExpression, HeadMovement } from '@/types/sign';

/** 2D 投影：将 3D 坐标投影到 2D 画布坐标 */
function project(pos: Vec3, centerX: number, centerY: number, scale: number): { x: number; y: number } {
  return {
    x: centerX + pos.x * scale,
    y: centerY - pos.y * scale,
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
    const w = this.width;
    const h = this.height;

    // 3D 坐标范围：y 从 0.0（脚底）到 1.72（头顶）
    // 投影映射：让脚底贴画布底部（留 5% 边距），头顶贴画布顶部（留 5% 边距）
    const padding = h * 0.06;
    const worldTop = 1.75;
    const worldBottom = 0.0;
    const worldRange = worldTop - worldBottom;
    const scale = (h - padding * 2) / worldRange;
    const cx = w / 2;
    // y_screen = cy - pos.y * scale; 当 pos.y = worldBottom 时，y_screen = h - padding
    const cy = h - padding + worldBottom * scale;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#1e293b';
    ctx.fillRect(0, 0, w, h);

    const joints = this.computeJoints(pose, cx, cy, scale);

    this.drawBody(joints, scale);
    this.drawArm(joints, 'left', scale);
    this.drawArm(joints, 'right', scale);
    this.drawHand(joints, 'left', pose.left_hand, scale);
    this.drawHand(joints, 'right', pose.right_hand, scale);
    this.drawHead(joints, pose.expression, pose.head_movement, scale);
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
  private drawBody(j: ReturnType<Skeleton2D['computeJoints']>, scale: number): void {
    const ctx = this.ctx;
    const lw = Math.max(2, scale * 0.05);
    ctx.strokeStyle = '#4a90d9';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';

    ctx.beginPath();
    ctx.moveTo(j.spine.x, j.spine.y);
    ctx.lineTo(j.chest.x, j.chest.y);
    ctx.lineTo(j.neck.x, j.neck.y);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(j.leftShoulder.x, j.leftShoulder.y);
    ctx.lineTo(j.rightShoulder.x, j.rightShoulder.y);
    ctx.stroke();
  }

  /** 绘制手臂 */
  private drawArm(j: ReturnType<Skeleton2D['computeJoints']>, side: 'left' | 'right', scale: number): void {
    const ctx = this.ctx;
    const lw = Math.max(1.5, scale * 0.04);
    const jointR = Math.max(2, scale * 0.025);
    ctx.strokeStyle = '#5a9ee0';
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';

    const shoulder = side === 'left' ? j.leftShoulder : j.rightShoulder;
    const elbow = side === 'left' ? j.leftElbow : j.rightElbow;
    const wrist = side === 'left' ? j.leftWrist : j.rightWrist;

    ctx.beginPath();
    ctx.moveTo(shoulder.x, shoulder.y);
    ctx.lineTo(elbow.x, elbow.y);
    ctx.lineTo(wrist.x, wrist.y);
    ctx.stroke();

    ctx.fillStyle = '#6ab0e8';
    ctx.beginPath();
    ctx.arc(elbow.x, elbow.y, jointR, 0, Math.PI * 2);
    ctx.fill();
  }

  /** 绘制手部（手掌+手指） */
  private drawHand(
    j: ReturnType<Skeleton2D['computeJoints']>,
    side: 'left' | 'right',
    hand: HandPose,
    scale: number,
  ): void {
    const ctx = this.ctx;
    const wrist = side === 'left' ? j.leftWrist : j.rightWrist;
    const angles = HAND_SHAPE_ANGLES[hand.shape] ?? HAND_SHAPE_ANGLES[HandShape.OPEN_5];
    const palmRx = scale * 0.05;
    const palmRy = scale * 0.04;
    const fingerLw = Math.max(1, scale * 0.018);
    const tipR = Math.max(1.2, scale * 0.015);

    ctx.fillStyle = '#6ab0e8';
    ctx.beginPath();
    ctx.ellipse(wrist.x, wrist.y - palmRy * 0.5, palmRx, palmRy, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = '#6ab0e8';
    ctx.lineWidth = fingerLw;
    ctx.lineCap = 'round';

    for (let fi = 0; fi < FINGER_NAMES.length; fi++) {
      const fingerName = FINGER_NAMES[fi];
      const root = FINGER_ROOTS[fingerName];
      const lengths = FINGER_LENGTHS[fingerName];
      const palmDir = side === 'left' ? -1 : 1;

      let px = wrist.x + root.x * scale * palmDir;
      let py = wrist.y - root.y * scale;

      ctx.beginPath();
      ctx.moveTo(px, py);

      let cumulativeAngle = 0;
      for (let ji = 0; ji < 3; ji++) {
        cumulativeAngle += angles[fi * 3 + ji];
        const cosA = Math.cos(cumulativeAngle);
        const sinA = Math.sin(cumulativeAngle);
        const rotDirX = -sinA;
        const rotDirY = -cosA;

        const segLen = lengths[ji] * scale;
        px += rotDirX * segLen;
        py += rotDirY * segLen;
        ctx.lineTo(px, py);
      }
      ctx.stroke();

      ctx.fillStyle = '#7ac0f0';
      ctx.beginPath();
      ctx.arc(px, py, tipR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** 绘制头部（含面部表情） */
  private drawHead(
    j: ReturnType<Skeleton2D['computeJoints']>,
    expression: FacialExpression,
    headMovement: HeadMovement,
    scale: number,
  ): void {
    const ctx = this.ctx;
    const headRadius = scale * 0.11;
    const featScale = headRadius / 18;

    let headOffsetX = 0;
    if (headMovement === HeadMovement.TILT_LEFT) headOffsetX = -headRadius * 0.17;
    if (headMovement === HeadMovement.TILT_RIGHT) headOffsetX = headRadius * 0.17;

    ctx.fillStyle = '#4a90d9';
    ctx.beginPath();
    ctx.arc(j.head.x + headOffsetX, j.head.y, headRadius, 0, Math.PI * 2);
    ctx.fill();

    const ex = j.head.x + headOffsetX;
    const ey = j.head.y;

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = Math.max(1, 2 * featScale);

    const eyeY = ey - headRadius * 0.17;
    const eyeOffset = headRadius * 0.33;
    const eyeR = headRadius * 0.17;
    const eyeSmallR = headRadius * 0.11;
    if (expression === FacialExpression.HAPPY || expression === FacialExpression.QUESTION) {
      ctx.beginPath();
      ctx.arc(ex - eyeOffset, eyeY, eyeR, Math.PI, 0, false);
      ctx.arc(ex + eyeOffset, eyeY, eyeR, Math.PI, 0, false);
      ctx.stroke();
    } else if (expression === FacialExpression.ANGRY || expression === FacialExpression.NEGATIVE) {
      ctx.beginPath();
      ctx.moveTo(ex - eyeOffset - headRadius * 0.11, eyeY - headRadius * 0.11);
      ctx.lineTo(ex - eyeOffset + headRadius * 0.11, eyeY + headRadius * 0.06);
      ctx.moveTo(ex + eyeOffset - headRadius * 0.11, eyeY + headRadius * 0.06);
      ctx.lineTo(ex + eyeOffset + headRadius * 0.11, eyeY - headRadius * 0.11);
      ctx.stroke();
    } else {
      ctx.fillStyle = '#1e293b';
      ctx.beginPath();
      ctx.arc(ex - eyeOffset, eyeY, eyeSmallR, 0, Math.PI * 2);
      ctx.arc(ex + eyeOffset, eyeY, eyeSmallR, 0, Math.PI * 2);
      ctx.fill();
    }

    const mouthY = ey + headRadius * 0.33;
    const mouthR = headRadius * 0.28;
    const mouthSmallR = headRadius * 0.17;
    ctx.beginPath();
    if (expression === FacialExpression.HAPPY) {
      ctx.arc(ex, mouthY - headRadius * 0.11, mouthR, 0, Math.PI, false);
    } else if (expression === FacialExpression.SAD) {
      ctx.arc(ex, mouthY + headRadius * 0.17, mouthR, Math.PI, 0, false);
    } else if (expression === FacialExpression.QUESTION || expression === FacialExpression.SURPRISED) {
      ctx.arc(ex, mouthY, mouthSmallR, 0, Math.PI * 2);
    } else if (expression === FacialExpression.NEGATIVE) {
      ctx.moveTo(ex - mouthR, mouthY + headRadius * 0.06);
      ctx.lineTo(ex + mouthR, mouthY - headRadius * 0.06);
    } else {
      ctx.moveTo(ex - mouthR, mouthY);
      ctx.lineTo(ex + mouthR, mouthY);
    }
    ctx.stroke();
  }

  /** 重置到中性姿态 */
  resetToNeutral(): void {
    // 2D 渲染无状态，无需重置
  }
}
