// 数据初始化器：负责首次加载词汇数据到 IndexedDB
// 检测 IDB 是否已有数据，若无则从静态 JSON 导入
// 性能优化：不阻塞首屏，内置常用词汇立即可用，完整数据后台加载

import type { SignGloss } from '@/types/sign';
import { idbAdapter, STORES } from './IndexedDBAdapter';
import { vocabularyStore } from './VocabularyStore';
import { appConfig } from '@/config';

const VOCABULARY_JSON_URL = appConfig.vocabularyUrl;

interface VocabularyFile {
  version: number;
  vocabulary: SignGloss[];
}

let initStarted = false;
let initPromise: Promise<void> | null = null;

/**
 * 初始化词汇数据
 * 性能优化策略：
 *   1. 不阻塞首屏渲染（VocabularyStore 已有内置常用词汇）
 *   2. 优先检查 IndexedDB，有数据则后台预热到内存缓存
 *   3. 无数据则后台下载并导入，不影响页面渲染
 *   4. 使用单例模式，避免重复初始化
 */
export async function initializeVocabulary(): Promise<void> {
  if (initStarted && initPromise) return initPromise;

  initStarted = true;
  initPromise = doInitialize();
  return initPromise;
}

async function doInitialize(): Promise<void> {
  try {
    await idbAdapter.init();

    const existing = await idbAdapter.getAll<SignGloss>(STORES.VOCABULARY);
    if (existing.length > 0) {
      await vocabularyStore.bulkImport(existing);
      return;
    }

    const response = await fetch(VOCABULARY_JSON_URL);
    if (!response.ok) {
      console.warn(`加载词汇数据失败：HTTP ${response.status}，使用内置常用词汇`);
      return;
    }

    const data = (await response.json()) as VocabularyFile;
    if (!data.vocabulary || data.vocabulary.length === 0) {
      console.warn('词汇数据为空，使用内置常用词汇');
      return;
    }

    await vocabularyStore.bulkImport(data.vocabulary);
  } catch (err) {
    console.warn('词汇数据初始化失败，使用内置常用词汇:', err);
  }
}
