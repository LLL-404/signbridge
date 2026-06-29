// 动作数据存储：基于 BaseDataStore 管理动作数据的查询与缓存
// 继承通用缓存管理逻辑，专注动作数据的存在性判断与预加载

import type { MotionData } from '@/types/avatar';
import { idbAdapter, STORES } from './IndexedDBAdapter';
import { BaseDataStore } from './BaseDataStore';

/**
 * 动作数据存储
 * 内存缓存 gloss_id -> MotionData，避免重复读取 IDB
 * 维护存在性索引集合，支持快速判断 hasMotion
 */
export class MotionDataStore extends BaseDataStore<MotionData> {
  protected readonly storeName = STORES.MOTION_DATA;
  protected readonly keyPath = 'gloss_id';

  /** 记录已确认存在的 gloss_id，用于快速判断 hasMotion */
  private existingIds = new Set<string>();
  /** 标记是否已加载全部存在性索引 */
  private isExistenceLoaded = false;

  /** 按 gloss_id 获取动作数据 */
  async getMotion(glossId: string): Promise<MotionData | undefined> {
    const result = await this.getById(glossId);
    if (result) {
      this.existingIds.add(glossId);
    }
    return result;
  }

  /** 判断指定词汇是否已有动作数据 */
  async hasMotion(glossId: string): Promise<boolean> {
    // 已知存在
    if (this.existingIds.has(glossId)) return true;
    // 已加载全部存在性索引且不在集合中
    if (this.isExistenceLoaded) return false;
    // 未加载则实际查询一次
    const data = await this.getMotion(glossId);
    return data !== undefined;
  }

  /** 写入单条动作数据，同步更新缓存与存在性集合 */
  async putMotion(data: MotionData): Promise<void> {
    try {
      await idbAdapter.put(this.storeName, data);
      this.setToCache(data.gloss_id, data);
      this.existingIds.add(data.gloss_id);
    } catch (error) {
      console.error(`[${this.storeName}] 写入动作数据失败:`, error);
      throw error;
    }
  }

  /** 批量导入动作数据，使用单事务提升性能 */
  async bulkImportMotions(data: MotionData[]): Promise<void> {
    await super.bulkImport(data);
    data.forEach((m) => this.existingIds.add(m.gloss_id));
    this.isExistenceLoaded = true;
  }

  /**
   * 预加载全部动作数据的存在性索引
   * 一次性读取所有 gloss_id，后续 hasMotion 可直接返回
   */
  async preloadExistence(): Promise<void> {
    if (this.isExistenceLoaded) return;
    const all = await idbAdapter.getAll<MotionData>(this.storeName);
    all.forEach((m) => {
      this.existingIds.add(m.gloss_id);
      this.setToCache(m.gloss_id, m);
    });
    this.isExistenceLoaded = true;
  }
}

/** 全局单例动作数据存储实例 */
export const motionDataStore = new MotionDataStore();
