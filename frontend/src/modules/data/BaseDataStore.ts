// 数据存储抽象基类：封装通用的缓存管理、数据访问与错误处理
// 子类通过继承获得统一的缓存机制，只需关注业务逻辑

import { idbAdapter } from './IndexedDBAdapter';

/** 缓存配置：控制缓存容量与过期策略 */
export interface CacheConfig {
  /** 最大缓存条目数，超出后淘汰最旧条目；Infinity 表示不限制 */
  maxSize: number;
  /** 缓存存活时间（毫秒），过期后自动失效；Infinity 表示永不过期 */
  ttl: number;
}

/** 默认缓存配置：不限制容量与过期时间，保证全量缓存场景的正确性 */
const DEFAULT_CACHE_CONFIG: CacheConfig = {
  maxSize: Infinity,
  ttl: Infinity,
};

/**
 * 数据存储抽象基类
 * 提供通用的内存缓存管理、IndexedDB 数据访问和错误处理机制
 * 子类需实现 storeName 与 keyPath 抽象属性
 */
export abstract class BaseDataStore<T> {
  /** 内存缓存：主键 -> 数据项 */
  protected cache = new Map<string, T>();
  /** 缓存写入时间戳：用于 TTL 过期判断 */
  private cacheTimestamps = new Map<string, number>();
  /** 缓存配置，子类可覆盖以启用容量限制或过期策略 */
  protected cacheConfig: CacheConfig = { ...DEFAULT_CACHE_CONFIG };

  /** IndexedDB Object Store 名称 */
  protected abstract readonly storeName: string;
  /** 主键字段名（用于从数据项中提取 key） */
  protected abstract readonly keyPath: string;

  /** 按主键获取数据项（优先命中缓存） */
  async getById(id: string): Promise<T | undefined> {
    const cached = this.getFromCache(id);
    if (cached !== undefined) return cached;

    try {
      const result = await idbAdapter.get<T>(this.storeName, id);
      if (result) {
        this.setToCache(id, result);
      }
      return result;
    } catch (error) {
      console.error(`[${this.storeName}] 按主键获取失败 (id=${id}):`, error);
      throw error;
    }
  }

  /** 获取全部数据项（若缓存非空则直接返回缓存） */
  async getAll(): Promise<T[]> {
    if (this.cache.size > 0) {
      return Array.from(this.cache.values());
    }

    try {
      const all = await idbAdapter.getAll<T>(this.storeName);
      all.forEach((item) => {
        const id = this.extractId(item);
        this.setToCache(id, item);
      });
      return all;
    } catch (error) {
      console.error(`[${this.storeName}] 获取全部数据失败:`, error);
      throw error;
    }
  }

  /** 批量导入数据项，同步更新内存缓存 */
  async bulkImport(items: T[]): Promise<void> {
    if (items.length === 0) return;

    try {
      await idbAdapter.bulkPut(this.storeName, items);
      items.forEach((item) => {
        const id = this.extractId(item);
        this.setToCache(id, item);
      });
    } catch (error) {
      console.error(`[${this.storeName}] 批量导入失败:`, error);
      throw error;
    }
  }

  /** 清空内存缓存 */
  clearCache(): void {
    this.cache.clear();
    this.cacheTimestamps.clear();
  }

  /** 获取当前缓存条目数 */
  getCacheSize(): number {
    return this.cache.size;
  }

  /** 清理已过期的缓存条目 */
  cleanupExpiredCache(): void {
    if (this.cacheConfig.ttl === Infinity) return;

    const now = Date.now();
    const expiredIds: string[] = [];
    this.cacheTimestamps.forEach((timestamp, id) => {
      if (now - timestamp > this.cacheConfig.ttl) {
        expiredIds.push(id);
      }
    });
    expiredIds.forEach((id) => {
      this.cache.delete(id);
      this.cacheTimestamps.delete(id);
    });
  }

  /** 从缓存获取数据项（含 TTL 过期检查） */
  protected getFromCache(id: string): T | undefined {
    const item = this.cache.get(id);
    if (item === undefined) return undefined;

    // TTL 过期检查
    if (this.cacheConfig.ttl !== Infinity) {
      const timestamp = this.cacheTimestamps.get(id) ?? 0;
      if (Date.now() - timestamp > this.cacheConfig.ttl) {
        this.cache.delete(id);
        this.cacheTimestamps.delete(id);
        return undefined;
      }
    }
    return item;
  }

  /** 将数据项写入缓存（含容量限制与淘汰策略） */
  protected setToCache(id: string, item: T): void {
    // 容量限制：达到上限时淘汰最旧条目
    if (this.cacheConfig.maxSize !== Infinity && !this.cache.has(id)) {
      if (this.cache.size >= this.cacheConfig.maxSize) {
        this.evictOldest();
      }
    }
    this.cache.set(id, item);
    this.cacheTimestamps.set(id, Date.now());
  }

  /** 从数据项中提取主键值 */
  protected extractId(item: T): string {
    return (item as Record<string, unknown>)[this.keyPath] as string;
  }

  /** 淘汰最旧的缓存条目（LRU 策略） */
  private evictOldest(): void {
    let oldestId: string | null = null;
    let oldestTime = Infinity;
    this.cacheTimestamps.forEach((timestamp, id) => {
      if (timestamp < oldestTime) {
        oldestTime = timestamp;
        oldestId = id;
      }
    });
    if (oldestId !== null) {
      this.cache.delete(oldestId);
      this.cacheTimestamps.delete(oldestId);
    }
  }
}
