// 数据初始化器：负责首次加载词汇数据到 IndexedDB
// 检测 IDB 是否已有数据，若无则从静态 JSON 导入
// 性能优化：不阻塞首屏，内置常用词汇立即可用，完整数据后台加载

import type { SignGloss } from '@/types/sign';
import { idbAdapter, STORES } from './IndexedDBAdapter';
import { vocabularyStore } from './VocabularyStore';
import { appConfig } from '@/config';
import { logger } from '@/modules/debug/logger';

const log = logger.module('DataInitializer');

const VOCABULARY_JSON_URL = appConfig.vocabularyUrl;

interface VocabularyFile {
  version: number;
  vocabulary: SignGloss[];
}

let initStarted = false;
let initPromise: Promise<void> | null = null;

/** 网络重试最大次数（含首次请求） */
const MAX_RETRY = 3;
/** 重试基础延迟（毫秒），实际延迟为 base * 2^(attempt-1) */
const RETRY_BASE_DELAY_MS = 500;

/**
 * 带重试的 fetch：网络错误或非 2xx 状态码时按指数退避重试
 * 仅对网络层与 5xx 重试，4xx 不重试（客户端错误不可恢复）
 */
async function fetchWithRetry(url: string, maxAttempts: number): Promise<Response> {
  let lastError: unknown = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const response = await fetch(url);
      // 5xx 服务端错误：重试
      if (response.status >= 500 && attempt < maxAttempts) {
        log.warn(`词汇数据请求返回 ${response.status}，第 ${attempt} 次重试`, { url });
        await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
        continue;
      }
      return response;
    } catch (err) {
      lastError = err;
      if (attempt < maxAttempts) {
        log.warn(`词汇数据请求异常，第 ${attempt} 次重试`, err);
        await delay(RETRY_BASE_DELAY_MS * Math.pow(2, attempt - 1));
        continue;
      }
    }
  }
  // 所有重试均失败，抛出最后一次错误
  throw lastError ?? new Error('fetchWithRetry: unknown failure');
}

/** Promise 延迟辅助 */
function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

/**
 * 获取词汇初始化 Promise（用于外部 await）
 * 若初始化尚未启动，返回已 resolve 的 Promise
 */
export function getVocabularyReadyPromise(): Promise<void> {
  return initPromise ?? Promise.resolve();
}

async function doInitialize(): Promise<void> {
  try {
    await idbAdapter.init();

    const existing = await idbAdapter.getAll<SignGloss>(STORES.VOCABULARY);
    if (existing.length > 0) {
      await vocabularyStore.bulkImport(existing);
      return;
    }

    // 网络请求带重试（最多 3 次），失败后由 VocabularyStore 内置常用词汇兜底
    let response: Response;
    try {
      response = await fetchWithRetry(VOCABULARY_JSON_URL, MAX_RETRY);
    } catch (err) {
      log.warn('词汇数据网络请求失败（已重试），使用内置常用词汇', err);
      return;
    }

    if (!response.ok) {
      log.warn(`加载词汇数据失败：HTTP ${response.status}，使用内置常用词汇`);
      return;
    }

    const data = (await response.json()) as VocabularyFile;
    if (!data.vocabulary || data.vocabulary.length === 0) {
      log.warn('词汇数据为空，使用内置常用词汇');
      return;
    }

    await vocabularyStore.bulkImport(data.vocabulary);
  } catch (err) {
    log.warn('词汇数据初始化失败，使用内置常用词汇', err);
  }
}
