/**
 * @file AvatarDriver.test.ts
 * @description 虚拟人动作驱动引擎单元测试
 *
 * 测试覆盖：
 *   - 空序列立即完成
 *   - 多词汇编排（motion + transition 交替队列）
 *   - stop() 重置队列与状态
 *   - setSpeed() 同步到 MotionPlayer
 *   - getCurrentPose() 初始为 NEUTRAL_POSE
 *   - isPlaying() 状态正确
 *   - 完成回调与 Promise resolve 触发
 *
 * 通过 vi.mock 隔离 VocabularyStore / MotionDataStore 单例，提供可控动作数据。
 *
 * 注意：playSequence 在有 motion 时返回的 Promise 不会立即 resolve——
 * 它要等整个队列播放完成（由 update() 推进）才 resolve。
 * 因此有 motion 的测试用 fire-and-forget + flush microtasks 模式，
 * 而非直接 await playSequence。
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { BonePose, MotionData } from '@/types/avatar';
import { NEUTRAL_POSE } from '@/types/avatar';
import type { GlossSequence } from '@/types/grammar';

// ===== Mock 数据存储单例 =====
// 使用 vi.hoisted 确保 mock 工厂能安全引用（vi.mock 会被提升到文件顶部）
const { mockMotions, mockStore } = vi.hoisted(() => {
  const motions = new Map<string, MotionData>();
  const store = {
    getMotion: vi.fn(async (id: string) => motions.get(id) ?? null),
    getById: vi.fn(async () => null),
  };
  return { mockMotions: motions, mockStore: store };
});

vi.mock('../data/MotionDataStore', () => ({
  motionDataStore: mockStore,
}));
vi.mock('../data/VocabularyStore', () => ({
  vocabularyStore: mockStore,
}));

// 在 mock 生效后导入被测模块
import { AvatarDriver } from './AvatarDriver';

/** flush microtasks，让 playSequence 内部的 await prepareMotion 完成 */
const flush = () => new Promise((r) => setTimeout(r, 0));

/** 构造一个最小可用的 BonePose（基于 NEUTRAL_POSE 深拷贝，避免共享引用） */
function makePose(): BonePose {
  return {
    ...NEUTRAL_POSE,
    left_hand: { ...NEUTRAL_POSE.left_hand, fingers: [...NEUTRAL_POSE.left_hand.fingers] },
    right_hand: { ...NEUTRAL_POSE.right_hand, fingers: [...NEUTRAL_POSE.right_hand.fingers] },
  };
}

/** 构造一个指定时长、指定帧数的动作数据 */
function makeMotion(glossId: string, durationMs: number, frameCount = 2): MotionData {
  const frames = Array.from({ length: frameCount }, (_, i) => ({
    pose: makePose(),
    timestamp: Math.round((i / (frameCount - 1)) * durationMs),
  }));
  return { gloss_id: glossId, frames, duration_ms: durationMs, loop: false };
}

/** 构造一个词汇序列 */
function makeSequence(glossIds: string[]): GlossSequence {
  return {
    items: glossIds.map((gloss_id) => ({ gloss_id, chinese: gloss_id })),
    sentence_non_manual: undefined,
  };
}

describe('AvatarDriver', () => {
  let driver: AvatarDriver;

  beforeEach(() => {
    driver = new AvatarDriver();
    mockMotions.clear();
    mockStore.getMotion.mockClear();
    mockStore.getById.mockClear();
  });

  it('空序列应立即完成并触发回调与 Promise resolve', async () => {
    const onComplete = vi.fn();
    // 空队列 → finish() 立即调用，Promise 立即 resolve，可安全 await
    await driver.playSequence(makeSequence([]), onComplete);
    expect(driver.isPlaying()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('单个词汇序列应播放对应动作并完成', async () => {
    mockMotions.set('g1', makeMotion('g1', 100));
    const onComplete = vi.fn();
    // 有 motion：Promise 不会立即 resolve，用 fire-and-forget
    const p = driver.playSequence(makeSequence(['g1']), onComplete);
    await flush(); // 等 prepareMotion + playCurrent 完成
    expect(driver.isPlaying()).toBe(true);
    driver.update(200); // 推进超过时长 → 完成
    await p;
    expect(driver.isPlaying()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('多词汇序列应在相邻动作间插入 transition（5 段全部完成）', async () => {
    mockMotions.set('g1', makeMotion('g1', 100));
    mockMotions.set('g2', makeMotion('g2', 100));
    mockMotions.set('g3', makeMotion('g3', 100));
    const onComplete = vi.fn();
    const p = driver.playSequence(makeSequence(['g1', 'g2', 'g3']), onComplete);
    await flush();
    expect(driver.isPlaying()).toBe(true);
    // 3 个 motion(100ms) + 2 个 transition(默认 300ms)，每段推进 600ms 足够触发单段完成
    for (let i = 0; i < 5; i++) {
      driver.update(600);
    }
    await p;
    expect(driver.isPlaying()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('stop() 应重置播放状态、清空队列', async () => {
    mockMotions.set('g1', makeMotion('g1', 1000));
    const p = driver.playSequence(makeSequence(['g1']));
    await flush();
    expect(driver.isPlaying()).toBe(true);
    driver.stop();
    await p; // stop 内部 resolve 了 Promise
    expect(driver.isPlaying()).toBe(false);
    // stop 后 update 不应再推进或报错
    driver.update(100);
    expect(driver.isPlaying()).toBe(false);
  });

  it('setSpeed() 应同步生效（影响后续 update 推进速度）', async () => {
    mockMotions.set('g1', makeMotion('g1', 100));
    const p = driver.playSequence(makeSequence(['g1']));
    await flush();
    driver.setSpeed(2.0); // 2 倍速
    driver.update(50); // 50ms × 2 = 100ms，达到时长 → 完成
    await p;
    expect(driver.isPlaying()).toBe(false);
  });

  it('getCurrentPose() 初始应返回 NEUTRAL_POSE', () => {
    const pose = driver.getCurrentPose();
    expect(pose).toEqual(NEUTRAL_POSE);
  });

  it('store 中不存在的词汇应被跳过（prepareMotion 返回 null）', async () => {
    // 不设置任何 motion，store 返回 null，prepareMotion 返回 null → motions 空 → 立即完成
    const onComplete = vi.fn();
    await driver.playSequence(makeSequence(['missing']), onComplete);
    expect(driver.isPlaying()).toBe(false);
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('update() 在未播放时应为空操作', () => {
    expect(() => driver.update(100)).not.toThrow();
    expect(driver.isPlaying()).toBe(false);
  });

  it('isPlaying() 在播放中应返回 true，完成后返回 false', async () => {
    mockMotions.set('g1', makeMotion('g1', 100));
    const p = driver.playSequence(makeSequence(['g1']));
    await flush();
    expect(driver.isPlaying()).toBe(true);
    driver.update(200);
    await p;
    expect(driver.isPlaying()).toBe(false);
  });
});
