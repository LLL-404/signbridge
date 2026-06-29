/**
 * 事件总线
 * 轻量级发布订阅，用于跨插件通信
 */

import type { EventHandler } from './types';

class EventBus {
  private handlers = new Map<string, Set<EventHandler>>();

  /** 订阅事件 */
  on(event: string, handler: EventHandler): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, new Set());
    }
    this.handlers.get(event)!.add(handler);
  }

  /** 取消订阅 */
  off(event: string, handler: EventHandler): void {
    this.handlers.get(event)?.delete(handler);
  }

  /** 发布事件 */
  emit(event: string, payload?: unknown): void {
    this.handlers.get(event)?.forEach((handler) => {
      try {
        handler(payload);
      } catch (err) {
        console.error(`[EventBus] 事件 "${event}" 处理器异常:`, err);
      }
    });
  }

  /** 清空所有订阅（测试用） */
  clear(): void {
    this.handlers.clear();
  }
}

/** 全局事件总线单例 */
export const eventBus = new EventBus();
