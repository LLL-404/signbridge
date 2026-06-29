// 词汇数据存储：基于 BaseDataStore 实现词汇查询与缓存
// 继承通用缓存管理逻辑，专注词汇业务查询（中文、分类、模糊搜索）

import type { SignGloss } from '@/types/sign';
import { idbAdapter, STORES } from './IndexedDBAdapter';
import { BaseDataStore } from './BaseDataStore';

/**
 * 词汇数据存储
 * 提供按 ID、中文、分类查询及模糊搜索能力
 * 需要全量缓存以支持内存过滤与搜索，因此禁用 TTL 与容量限制
 */
export class VocabularyStore extends BaseDataStore<SignGloss> {
  protected readonly storeName = STORES.VOCABULARY;
  protected readonly keyPath = 'gloss_id';

  /** 标记缓存是否已加载全部数据 */
  private isCacheLoaded = false;

  /** 按中文精确查询（可能存在同词多义，返回数组） */
  async getByChinese(chinese: string): Promise<SignGloss[]> {
    if (this.isCacheLoaded) {
      return this.filterFromCache((g) => g.chinese === chinese);
    }
    return idbAdapter.getByIndex<SignGloss>(this.storeName, 'chinese', chinese);
  }

  /** 按分类查询 */
  async getByCategory(category: string): Promise<SignGloss[]> {
    if (this.isCacheLoaded) {
      return this.filterFromCache((g) => g.category === category);
    }
    return idbAdapter.getByIndex<SignGloss>(this.storeName, 'category', category);
  }

  /**
   * 模糊搜索中文词
   * 使用内存缓存进行 includes 匹配，支持部分字符匹配
   */
  async search(query: string): Promise<SignGloss[]> {
    const trimmed = query.trim();
    if (trimmed === '') return [];

    await this.ensureCacheLoaded();
    const lowerQuery = trimmed.toLowerCase();
    return this.filterFromCache(
      (g) =>
        g.chinese.toLowerCase().includes(lowerQuery) ||
        (g.english?.toLowerCase().includes(lowerQuery) ?? false),
    );
  }

  /** 获取全部词汇（确保全量缓存已加载） */
  async getAll(): Promise<SignGloss[]> {
    await this.ensureCacheLoaded();
    return Array.from(this.cache.values());
  }

  /** 获取所有不重复的分类 */
  async getCategories(): Promise<string[]> {
    await this.ensureCacheLoaded();
    const categories = new Set<string>();
    this.cache.forEach((g) => categories.add(g.category));
    return Array.from(categories);
  }

  /** 批量导入词汇，同时更新内存缓存 */
  async bulkImport(glosses: SignGloss[]): Promise<void> {
    await super.bulkImport(glosses);
    this.isCacheLoaded = true;
  }

  /**
   * 确保内存缓存已加载全部数据
   * 仅加载一次，后续直接使用缓存
   */
  private async ensureCacheLoaded(): Promise<void> {
    if (this.isCacheLoaded) return;
    const all = await idbAdapter.getAll<SignGloss>(this.storeName);
    all.forEach((g) => this.setToCache(g.gloss_id, g));
    this.isCacheLoaded = true;
  }

  /** 基于缓存过滤的辅助方法 */
  private filterFromCache(predicate: (g: SignGloss) => boolean): SignGloss[] {
    const result: SignGloss[] = [];
    this.cache.forEach((g) => {
      if (predicate(g)) result.push(g);
    });
    return result;
  }
}

/** 全局单例词汇存储实例 */
export const vocabularyStore = new VocabularyStore();
