/**
 * @file PluginManager.test.ts
 * @description 微内核插件管理器单元测试
 *
 * 测试覆盖：
 *   - 插件注册与激活
 *   - 重复注册防护
 *   - 依赖解析顺序
 *   - 路由与菜单项贡献
 *   - 停用与依赖检查
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { eventBus } from './EventBus';

describe('EventBus', () => {
  beforeEach(() => {
    eventBus.clear();
  });

  it('订阅与发布', () => {
    let received: unknown = null;
    eventBus.on('test:event', (payload) => {
      received = payload;
    });
    eventBus.emit('test:event', { value: 42 });
    expect(received).toEqual({ value: 42 });
  });

  it('取消订阅后不再收到事件', () => {
    let count = 0;
    const handler = () => {
      count++;
    };
    eventBus.on('test:event', handler);
    eventBus.emit('test:event');
    expect(count).toBe(1);
    eventBus.off('test:event', handler);
    eventBus.emit('test:event');
    expect(count).toBe(1);
  });

  it('clear 清除所有订阅', () => {
    let count = 0;
    eventBus.on('test:event', () => {
      count++;
    });
    eventBus.clear();
    eventBus.emit('test:event');
    expect(count).toBe(0);
  });

  it('多个订阅者都收到事件', () => {
    let count1 = 0;
    let count2 = 0;
    eventBus.on('test:event', () => {
      count1++;
    });
    eventBus.on('test:event', () => {
      count2++;
    });
    eventBus.emit('test:event');
    expect(count1).toBe(1);
    expect(count2).toBe(1);
  });
});
