/**
 * @file logger.test.ts
 * @description 统一日志模块单元测试
 *
 * 测试覆盖：
 *   - 各级别输出（debug/info/warn/error）
 *   - 模块前缀正确附加
 *   - ring buffer 容量限制（超过 200 条丢弃最旧）
 *   - 级别过滤（warn 级别下 debug/info 不输出）
 *   - getBuffer/clearBuffer/onBufferChange
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { logger, type LogEntry } from './logger';

describe('Logger', () => {
  beforeEach(() => {
    // 每个测试前重置 logger 状态
    logger.clearBuffer();
    logger.setLevel('debug');
    // 静默 console 输出，避免污染测试输出
    vi.spyOn(console, 'debug').mockImplementation(() => {});
    vi.spyOn(console, 'info').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('各级别输出', () => {
    it('debug 级别日志写入 buffer 并调用 console.debug', () => {
      const mod = logger.module('TestDebug');
      mod.debug('调试消息', { key: 'value' });

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe('debug');
      expect(buffer[0].module).toBe('TestDebug');
      expect(buffer[0].message).toBe('调试消息');
      expect(buffer[0].data).toEqual([{ key: 'value' }]);
      expect(console.debug).toHaveBeenCalledTimes(1);
    });

    it('info 级别日志写入 buffer 并调用 console.info', () => {
      const mod = logger.module('TestInfo');
      mod.info('信息消息');

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe('info');
      expect(buffer[0].data).toBeUndefined();
      expect(console.info).toHaveBeenCalledTimes(1);
    });

    it('warn 级别日志写入 buffer 并调用 console.warn', () => {
      const mod = logger.module('TestWarn');
      mod.warn('警告消息', 42, 'extra');

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe('warn');
      expect(buffer[0].data).toEqual([42, 'extra']);
      expect(console.warn).toHaveBeenCalledTimes(1);
    });

    it('error 级别日志写入 buffer 并调用 console.error', () => {
      const mod = logger.module('TestError');
      mod.error('错误消息', new Error('boom'));

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(1);
      expect(buffer[0].level).toBe('error');
      expect(buffer[0].data).toHaveLength(1);
      expect(console.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('模块前缀', () => {
    it('不同模块 logger 各自附加正确的模块名', () => {
      const modA = logger.module('ModuleA');
      const modB = logger.module('ModuleB');
      modA.info('来自 A');
      modB.info('来自 B');

      const buffer = logger.getBuffer();
      expect(buffer).toHaveLength(2);
      // 第一条来自 ModuleA
      expect(buffer[0].module).toBe('ModuleA');
      expect(buffer[0].message).toBe('来自 A');
      // 第二条来自 ModuleB
      expect(buffer[1].module).toBe('ModuleB');
      expect(buffer[1].message).toBe('来自 B');
    });
  });

  describe('ring buffer 容量限制', () => {
    it('超过 200 条时丢弃最旧条目，保留最新 200 条', () => {
      const mod = logger.module('BufTest');
      // 写入 210 条日志
      for (let i = 0; i < 210; i++) {
        mod.info(`message-${i}`);
      }

      const buffer = logger.getBuffer();
      // 容量限制为 200
      expect(buffer).toHaveLength(200);
      // 最旧的 message-0 ~ message-9 被丢弃，buffer[0] 为 message-10
      expect(buffer[0].message).toBe('message-10');
      // 最新的 message-209 保留在末尾
      expect(buffer[199].message).toBe('message-209');
    });
  });

  describe('级别过滤', () => {
    it('warn 级别下 debug/info 不写入 buffer 也不调用 console', () => {
      // 模拟生产模式：设置为 warn 级别
      logger.setLevel('warn');
      const mod = logger.module('FilterTest');

      mod.debug('debug 消息');
      mod.info('info 消息');
      mod.warn('warn 消息');
      mod.error('error 消息');

      const buffer = logger.getBuffer();
      // 仅 warn 和 error 写入 buffer（debug/info 被过滤）
      expect(buffer).toHaveLength(2);
      expect(buffer[0].level).toBe('warn');
      expect(buffer[1].level).toBe('error');
      // debug/info 未调用对应 console 方法
      expect(console.debug).not.toHaveBeenCalled();
      expect(console.info).not.toHaveBeenCalled();
      // warn/error 调用了对应 console 方法
      expect(console.warn).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledTimes(1);
    });
  });

  describe('buffer 操作', () => {
    it('getBuffer 返回副本，修改副本不影响内部状态', () => {
      const mod = logger.module('CopyTest');
      mod.info('test');

      const buf1 = logger.getBuffer();
      expect(buf1).toHaveLength(1);
      // 修改副本：弹出元素并添加伪造条目
      buf1.pop();
      buf1.push({
        timestamp: 0,
        date: '',
        level: 'error',
        module: 'fake',
        message: 'fake',
      });

      // 内部 buffer 不受影响
      const buf2 = logger.getBuffer();
      expect(buf2).toHaveLength(1);
      expect(buf2[0].message).toBe('test');
    });

    it('clearBuffer 清空缓冲区', () => {
      const mod = logger.module('ClearTest');
      mod.info('msg1');
      mod.info('msg2');
      expect(logger.getBuffer()).toHaveLength(2);

      logger.clearBuffer();
      expect(logger.getBuffer()).toHaveLength(0);
    });

    it('onBufferChange 在日志写入时收到通知，取消订阅后不再收到', () => {
      const received: LogEntry[][] = [];
      const unsubscribe = logger.onBufferChange((entries) => {
        received.push(entries);
      });

      const mod = logger.module('ListenTest');
      mod.info('第一条');
      mod.warn('第二条');

      // 两次日志写入，收到两次通知
      expect(received).toHaveLength(2);
      // 第一次通知包含 1 条记录
      expect(received[0]).toHaveLength(1);
      expect(received[0][0].message).toBe('第一条');
      // 第二次通知包含 2 条记录（累积）
      expect(received[1]).toHaveLength(2);
      expect(received[1][1].message).toBe('第二条');

      // 取消订阅后再写入，不再收到通知
      unsubscribe();
      mod.info('第三条');
      expect(received).toHaveLength(2);
    });
  });
});
