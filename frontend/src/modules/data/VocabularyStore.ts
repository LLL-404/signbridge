// 词汇数据存储：基于 BaseDataStore 实现词汇查询与缓存
// 继承通用缓存管理逻辑，专注词汇业务查询（中文、分类、模糊搜索）

import type { SignGloss } from '@/types/sign';
import { idbAdapter, STORES } from './IndexedDBAdapter';
import { BaseDataStore } from './BaseDataStore';
import { COMMON_VOCABULARY } from './CommonVocabulary';

/**
 * 词汇数据存储
 * 提供按 ID、中文、分类查询及模糊搜索能力
 * 需要全量缓存以支持内存过滤与搜索，因此禁用 TTL 与容量限制
 * 
 * 性能优化：
 *   - 启动时内置常用词汇（COMMON_VOCABULARY）作为初始缓存，立即可用
 *   - 完整词汇库在后台异步加载，加载完成后合并到缓存中
 *   - 避免首屏等待 300KB+ 词汇数据下载和 IndexedDB 初始化
 */
export class VocabularyStore extends BaseDataStore<SignGloss> {
  protected readonly storeName = STORES.VOCABULARY;
  protected readonly keyPath = 'gloss_id';

  /** 标记缓存是否已加载全部数据（完整词汇库） */
  private isFullCacheLoaded = false;
  /** 标记是否正在从 IndexedDB 加载完整数据 */
  private isLoading = false;
  /** 加载 Promise，避免重复加载 */
  private loadPromise: Promise<void> | null = null;

  constructor() {
    super();
    this.initializeCommonCache();
  }

  /** 初始化常用词汇缓存，确保立即可用 */
  private initializeCommonCache(): void {
    COMMON_VOCABULARY.forEach((g) => this.setToCache(g.gloss_id, g));
  }

  /** 按中文精确查询（可能存在同词多义，返回数组） */
  async getByChinese(chinese: string): Promise<SignGloss[]> {
    const cached = this.filterFromCache((g) => g.chinese === chinese);
    if (cached.length > 0) return cached;

    if (this.isFullCacheLoaded) return [];

    const idbResults = await idbAdapter.getByIndex<SignGloss>(this.storeName, 'chinese', chinese);
    idbResults.forEach((g) => this.setToCache(g.gloss_id, g));
    return idbResults;
  }

  /** 按分类查询 */
  async getByCategory(category: string): Promise<SignGloss[]> {
    if (this.isFullCacheLoaded) {
      return this.filterFromCache((g) => g.category === category);
    }
    await this.ensureFullCacheLoaded();
    return this.filterFromCache((g) => g.category === category);
  }

  /**
   * 模糊搜索中文词
   * 使用内存缓存进行 includes 匹配，支持部分字符匹配
   */
  async search(query: string): Promise<SignGloss[]> {
    const trimmed = query.trim();
    if (trimmed === '') return [];

    await this.ensureFullCacheLoaded();
    const lowerQuery = trimmed.toLowerCase();
    return this.filterFromCache(
      (g) =>
        g.chinese.toLowerCase().includes(lowerQuery) ||
        (g.english?.toLowerCase().includes(lowerQuery) ?? false),
    );
  }

  /** 获取全部词汇（确保全量缓存已加载） */
  async getAll(): Promise<SignGloss[]> {
    await this.ensureFullCacheLoaded();
    return Array.from(this.cache.values());
  }

  /** 获取所有不重复的分类 */
  async getCategories(): Promise<string[]> {
    await this.ensureFullCacheLoaded();
    const categories = new Set<string>();
    this.cache.forEach((g) => categories.add(g.category));
    return Array.from(categories);
  }

  /** 批量导入词汇，同时更新内存缓存 */
  async bulkImport(glosses: SignGloss[]): Promise<void> {
    await super.bulkImport(glosses);
    glosses.forEach((g) => this.setToCache(g.gloss_id, g));
    this.isFullCacheLoaded = true;
  }

  /**
   * 确保内存缓存已加载全部数据
   * 仅加载一次，后续直接使用缓存
   */
  private async ensureFullCacheLoaded(): Promise<void> {
    if (this.isFullCacheLoaded) return;
    if (this.loadPromise) return this.loadPromise;

    this.isLoading = true;
    this.loadPromise = this.loadFullCache();
    return this.loadPromise;
  }

  /** 从 IndexedDB 加载完整词汇数据到内存缓存 */
  private async loadFullCache(): Promise<void> {
    try {
      const all = await idbAdapter.getAll<SignGloss>(this.storeName);
      if (all.length > 0) {
        all.forEach((g) => this.setToCache(g.gloss_id, g));
        this.isFullCacheLoaded = true;
      }
    } catch (err) {
      console.warn('加载完整词汇缓存失败，使用内置常用词汇:', err);
    } finally {
      this.isLoading = false;
    }
  }

  /** 检查完整词汇库是否已加载 */
  isFullyLoaded(): boolean {
    return this.isFullCacheLoaded;
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
