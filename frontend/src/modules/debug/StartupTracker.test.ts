/**
 * @file StartupTracker.test.ts
 * @description 启动计时器单元测试
 *
 * 测试覆盖：
 *   - 正常计时（start → end，duration > 0）
 *   - 失败记录（start → fail，status = failed，error 有值）
 *   - 并发阶段（同时 start 多个阶段，各自独立 end）
 *   - getReport 返回所有阶段
 *   - getCurrentPhase 返回当前运行阶段
 *
 * 注意：StartupTracker 为单例，无 reset 方法，各测试使用唯一阶段名
 * 避免相互干扰；时间相关断言使用 vi.useFakeTimers 确保确定性。
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { startupTracker } from './StartupTracker';

describe('StartupTracker', () => {
  beforeEach(() => {
    // 静默 console 输出（StartupTracker 内部通过 logger 输出日志）
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    // 确保恢复真实定时器，即使测试中途失败
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('正常计时：start → end 后 status 为 success 且 duration > 0', () => {
    vi.useFakeTimers();

    startupTracker.start('normal-phase', '正常阶段');
    // 推进 100ms 后结束
    vi.advanceTimersByTime(100);
    startupTracker.end('normal-phase');

    const phase = startupTracker.getReport().find(p => p.name === 'normal-phase');
    expect(phase).toBeDefined();
    expect(phase!.status).toBe('success');
    expect(phase!.duration).toBeGreaterThan(0);
    // 错误字段不应存在
    expect(phase!.error).toBeUndefined();
  });

  it('失败记录：start → fail 后 status 为 failed 且 error 有值', () => {
    vi.useFakeTimers();

    startupTracker.start('fail-phase', '失败阶段');
    vi.advanceTimersByTime(50);
    startupTracker.fail('fail-phase', new Error('初始化失败'));

    const phase = startupTracker.getReport().find(p => p.name === 'fail-phase');
    expect(phase).toBeDefined();
    expect(phase!.status).toBe('failed');
    expect(phase!.error).toBe('初始化失败');
    expect(phase!.duration).toBeGreaterThan(0);
  });

  it('并发阶段：同时 start 多个阶段，各自独立 end', () => {
    vi.useFakeTimers();

    // 同时启动两个阶段
    startupTracker.start('concurrent-a', '并发A');
    startupTracker.start('concurrent-b', '并发B');

    // 最后 start 的阶段为 currentPhase
    expect(startupTracker.getCurrentPhase()?.name).toBe('concurrent-b');

    // 推进 50ms 后结束 A，B 仍运行中
    vi.advanceTimersByTime(50);
    startupTracker.end('concurrent-a');
    expect(startupTracker.getCurrentPhase()?.name).toBe('concurrent-b');

    // 再推进 30ms 后结束 B
    vi.advanceTimersByTime(30);
    startupTracker.end('concurrent-b');

    const report = startupTracker.getReport();
    const phaseA = report.find(p => p.name === 'concurrent-a');
    const phaseB = report.find(p => p.name === 'concurrent-b');

    // 两个阶段各自成功结束
    expect(phaseA?.status).toBe('success');
    expect(phaseB?.status).toBe('success');
    // 各自独立计时：A 耗时 50ms，B 耗时 80ms（50+30）
    expect(phaseA?.duration).toBe(50);
    expect(phaseB?.duration).toBe(80);
  });

  it('getReport 返回所有阶段记录', () => {
    vi.useFakeTimers();

    startupTracker.start('report-a', '报告A');
    startupTracker.start('report-b', '报告B');
    startupTracker.end('report-a');
    startupTracker.end('report-b');

    const report = startupTracker.getReport();
    const names = report.map(p => p.name);

    // 单例会累积所有历史阶段，但本测试启动的阶段必须存在
    expect(names).toContain('report-a');
    expect(names).toContain('report-b');

    // 验证记录字段完整性
    const phaseA = report.find(p => p.name === 'report-a');
    expect(phaseA?.label).toBe('报告A');
    expect(phaseA?.status).toBe('success');
    expect(phaseA?.duration).toBeGreaterThanOrEqual(0);
  });

  it('getCurrentPhase 返回当前运行中的阶段', () => {
    vi.useFakeTimers();

    // 启动阶段后应为当前阶段
    startupTracker.start('current-test', '当前阶段');
    const current = startupTracker.getCurrentPhase();
    expect(current).not.toBeNull();
    expect(current!.name).toBe('current-test');
    expect(current!.status).toBe('running');
    expect(current!.label).toBe('当前阶段');

    // 结束后不再返回该阶段
    startupTracker.end('current-test');
    const after = startupTracker.getCurrentPhase();
    // current-test 已结束，currentPhase 应为 null 或其他阶段
    expect(after?.name).not.toBe('current-test');
  });
});
