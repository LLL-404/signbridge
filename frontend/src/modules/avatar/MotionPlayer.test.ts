/**
 * @file MotionPlayer.test.ts
 * @description 动作播放器单元测试
 *
 * 测试覆盖：
 *   - play / stop / pause / resume 状态机
 *   - setSpeed 变速播放（正数生效，<=0 回退到 1.0）
 *   - 线性插值：帧间时间 t=0 取第一帧，t=1 取最后一帧，t=0.5 中间插值
 *   - 非循环动作：播放完成触发回调、姿态固定到最后一帧、playing 变 false
 *   - 循环动作：超过时长取模回到起点继续播放
 *   - 无 motion 时 update 为空操作
 *   - getCurrentPose 初始为 NEUTRAL_POSE
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BonePose, MotionData, JointPose } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import { MotionPlayer } from './MotionPlayer';

/** 深拷贝 BonePose，避免帧间共享引用 */
function clonePose(p: BonePose): BonePose {
  const fingers = p.left_hand.fingers.map((f) => ({ ...f })) as [JointPose, JointPose, JointPose, JointPose, JointPose];
  const fingersR = p.right_hand.fingers.map((f) => ({ ...f })) as [JointPose, JointPose, JointPose, JointPose, JointPose];
  return {
    ...p,
    left_shoulder: { ...p.left_shoulder },
    right_shoulder: { ...p.right_shoulder },
    left_elbow: { ...p.left_elbow },
    right_elbow: { ...p.right_elbow },
    left_wrist: { ...p.left_wrist },
    right_wrist: { ...p.right_wrist },
    root: { ...p.root },
    spine: { ...p.spine },
    chest: { ...p.chest },
    neck: { ...p.neck },
    head: { ...p.head },
    left_hand: {
      ...p.left_hand,
      wrist: { ...p.left_hand.wrist },
      fingers,
    },
    right_hand: {
      ...p.right_hand,
      wrist: { ...p.right_hand.wrist },
      fingers: fingersR,
    },
  };
}

/**
 * 构造一个指定位置偏移的 pose：root.position.x = xOffset
 * 用于验证插值正确性（x 分量线性变化）
 */
function makePoseWithX(xOffset: number): BonePose {
  const p = clonePose(NEUTRAL_POSE);
  p.root.position = { ...p.root.position, x: p.root.position.x + xOffset };
  return p;
}

/** 构造 2 帧动作数据（起点 root.x=0，终点 root.x=1，时长 100ms） */
function makeTwoFrameMotion(loop = false): MotionData {
  const startPose = makePoseWithX(0);
  const endPose = makePoseWithX(1);
  return {
    gloss_id: 'test',
    frames: [
      { pose: startPose, timestamp: 0 },
      { pose: endPose, timestamp: 100 },
    ],
    duration_ms: 100,
    loop,
  };
}

/** 构造 3 帧动作数据（root.x = 0 / 0.5 / 1，时间戳 0/50/100ms，时长 100ms） */
function makeThreeFrameMotion(): MotionData {
  return {
    gloss_id: 'test3',
    frames: [
      { pose: makePoseWithX(0), timestamp: 0 },
      { pose: makePoseWithX(0.5), timestamp: 50 },
      { pose: makePoseWithX(1), timestamp: 100 },
    ],
    duration_ms: 100,
    loop: false,
  };
}

describe('MotionPlayer', () => {
  let player: MotionPlayer;

  beforeEach(() => {
    player = new MotionPlayer();
  });

  it('初始姿态应为 NEUTRAL_POSE，未播放', () => {
    expect(player.getCurrentPose()).toEqual(NEUTRAL_POSE);
    expect(player.isPlaying()).toBe(false);
  });

  it('play 后 isPlaying 应为 true，初始姿态为第一帧', () => {
    const motion = makeTwoFrameMotion();
    player.play(motion);
    expect(player.isPlaying()).toBe(true);
    // 初始化为第一帧：root.position.x = NEUTRAL_POSE.root.position.x (0 offset)
    const pose = player.getCurrentPose();
    expect(pose.root.position.x).toBeCloseTo(NEUTRAL_POSE.root.position.x, 5);
  });

  it('stop 后应重置为 NEUTRAL_POSE 且不再播放', () => {
    const motion = makeTwoFrameMotion();
    player.play(motion);
    player.update(50);
    expect(player.isPlaying()).toBe(true);
    player.stop();
    expect(player.isPlaying()).toBe(false);
    expect(player.getCurrentPose()).toEqual(NEUTRAL_POSE);
  });

  it('pause/resume 应控制播放状态但不重置姿态', () => {
    const motion = makeTwoFrameMotion();
    player.play(motion);
    player.update(30);
    player.pause();
    expect(player.isPlaying()).toBe(false); // paused
    const pausedPose = player.getCurrentPose();
    // 暂停后 update 不应推进时间
    player.update(1000);
    expect(player.getCurrentPose()).toEqual(pausedPose);
    player.resume();
    expect(player.isPlaying()).toBe(true);
  });

  it('非循环动作完成时应触发 onComplete、固定最后一帧、isPlaying=false', () => {
    const motion = makeTwoFrameMotion(false);
    const onComplete = vi.fn();
    player.play(motion, onComplete);
    player.update(200); // 远超 100ms
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(false);
    // 姿态固定到最后一帧（root.x = NEUTRAL + 1）
    const pose = player.getCurrentPose();
    expect(pose.root.position.x).toBeCloseTo(NEUTRAL_POSE.root.position.x + 1, 5);
  });

  it('非循环动作不应在未完成时触发 onComplete', () => {
    const motion = makeTwoFrameMotion(false);
    const onComplete = vi.fn();
    player.play(motion, onComplete);
    player.update(50); // 半程
    expect(onComplete).not.toHaveBeenCalled();
    expect(player.isPlaying()).toBe(true);
  });

  it('帧间插值：t=0 为起点，t=0.5 为中点，t=1 为终点', () => {
    const motion = makeTwoFrameMotion();
    player.play(motion);
    // t=0 (0ms): root.x ≈ NEUTRAL + 0
    player.update(0);
    expect(player.getCurrentPose().root.position.x).toBeCloseTo(NEUTRAL_POSE.root.position.x, 5);
    // t=0.5 (50ms): root.x ≈ NEUTRAL + 0.5
    player.update(50);
    expect(player.getCurrentPose().root.position.x).toBeCloseTo(NEUTRAL_POSE.root.position.x + 0.5, 5);
    // 继续推进到 t=1 (再 50ms = 100ms 总时长): root.x ≈ NEUTRAL + 1
    player.update(50);
    // 注意：到 100ms 时非循环会触发完成并固定到最后一帧
    expect(player.getCurrentPose().root.position.x).toBeCloseTo(NEUTRAL_POSE.root.position.x + 1, 5);
  });

  it('3 帧动作应在各帧区间正确插值', () => {
    const motion = makeThreeFrameMotion();
    player.play(motion);
    // 25ms: 在 [0, 50] 区间中点 t=0.5，root.x ≈ 0 + (0.5-0)*0.5 = 0.25
    player.update(25);
    expect(player.getCurrentPose().root.position.x).toBeCloseTo(NEUTRAL_POSE.root.position.x + 0.25, 5);
    // 75ms: 在 [50, 100] 区间中点 t=0.5，root.x ≈ 0.5 + (1-0.5)*0.5 = 0.75
    player = new MotionPlayer();
    player.play(motion);
    player.update(75);
    expect(player.getCurrentPose().root.position.x).toBeCloseTo(NEUTRAL_POSE.root.position.x + 0.75, 5);
  });

  it('setSpeed(2.0) 应让播放速度加倍（50ms 实际推进 100ms）', () => {
    const motion = makeTwoFrameMotion(false);
    const onComplete = vi.fn();
    player.play(motion, onComplete);
    player.setSpeed(2.0);
    player.update(50); // 50ms × 2 = 100ms 播放时间，应完成
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(player.isPlaying()).toBe(false);
  });

  it('setSpeed(<=0) 应回退到 1.0（防御性）', () => {
    const motion = makeTwoFrameMotion(false);
    player.play(motion);
    player.setSpeed(0);
    player.update(200); // 以 1.0 速度推进 200ms，应完成
    expect(player.isPlaying()).toBe(false);
  });

  it('循环动作超过时长后应取模继续播放而非结束', () => {
    const motion = makeTwoFrameMotion(true);
    const onComplete = vi.fn();
    player.play(motion, onComplete);
    // 推进 150ms（超过 100ms 时长 50ms）
    player.update(150);
    // 循环：不应触发 onComplete，仍在播放
    expect(onComplete).not.toHaveBeenCalled();
    expect(player.isPlaying()).toBe(true);
    // 150ms mod 100 = 50ms，应在 t=0.5 位置（root.x ≈ 0.5）
    expect(player.getCurrentPose().root.position.x).toBeCloseTo(NEUTRAL_POSE.root.position.x + 0.5, 5);
  });

  it('未调用 play 时 update 应为空操作', () => {
    expect(() => player.update(100)).not.toThrow();
    expect(player.isPlaying()).toBe(false);
    expect(player.getCurrentPose()).toEqual(NEUTRAL_POSE);
  });

  it('pause 未播放时不应有效果', () => {
    player.pause();
    expect(player.isPlaying()).toBe(false);
    player.resume();
    expect(player.isPlaying()).toBe(false);
  });
});
