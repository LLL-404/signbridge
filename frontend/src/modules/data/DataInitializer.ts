// 数据初始化器：负责首次加载词汇数据到 IndexedDB
// 检测 IDB 是否已有数据，若无则从静态 JSON 导入

import type { SignGloss } from '@/types/sign';
import { idbAdapter, STORES } from './IndexedDBAdapter';
import { vocabularyStore } from './VocabularyStore';
import { appConfig } from '@/config';

/** 词汇数据 JSON 的 URL（从环境配置读取，默认位于 public/data 下） */
const VOCABULARY_JSON_URL = appConfig.vocabularyUrl;

/** 词汇数据 JSON 的结构 */
interface VocabularyFile {
  version: number;
  vocabulary: SignGloss[];
}

/**
 * 初始化词汇数据
 * 1. 检查 IndexedDB 中 vocabulary store 是否已有数据
 * 2. 若无，fetch 静态 JSON 并 bulkPut 到 IDB
 * 3. 若已有，跳过导入
 */
export async function initializeVocabulary(): Promise<void> {
  // 确保数据库已初始化
  await idbAdapter.init();

  // 检查是否已有数据
  const existing = await idbAdapter.getAll<SignGloss>(STORES.VOCABULARY);
  if (existing.length > 0) {
    // 已有数据，预热内存缓存
    await vocabularyStore.getAll();
    return;
  }

  // 拉取静态词汇 JSON
  const response = await fetch(VOCABULARY_JSON_URL);
  if (!response.ok) {
    throw new Error(`加载词汇数据失败：HTTP ${response.status}`);
  }

  const data = (await response.json()) as VocabularyFile;
  if (!data.vocabulary || data.vocabulary.length === 0) {
    throw new Error('词汇数据为空');
  }

  // 批量写入 IndexedDB，同时更新 VocabularyStore 内存缓存
  await vocabularyStore.bulkImport(data.vocabulary);
}
