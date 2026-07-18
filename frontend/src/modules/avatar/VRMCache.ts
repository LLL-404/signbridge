/**
 * VRM 模型分级加载与持久化缓存
 *
 * 加载优先级：内存缓存 → IndexedDB → HTTP
 *
 * 内存缓存：Map<string, Promise<VRM>>，避免 React StrictMode 双重渲染重复加载
 * IndexedDB 缓存：key=URL, value={ arrayBuffer, timestamp, version }
 *
 * 失败处理：
 *   - IndexedDB 读取/解析失败 → 回退到 HTTP
 *   - HTTP 加载失败 → 清除内存缓存中的 Promise，允许重试
 *   - 所有 IDB 操作均 try-catch，不阻塞加载流程
 */

import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { VRMLoaderPlugin, type VRM } from '@pixiv/three-vrm';
import { logger } from '@/modules/debug/logger';

const log = logger.module('VRMCache');

/** 缓存版本号（升级模型解析逻辑时递增以作废旧缓存） */
const VRM_CACHE_VERSION = '1';

/**
 * 独立 IDB 数据库与 Store 名称
 * 不复用 IndexedDBAdapter：避免修改其 STORES / STORE_CONFIGS 静态配置
 */
const DB_NAME = 'signbridge-vrm-cache';
const DB_VERSION = 1;
const STORE_NAME = 'vrm_cache';

/** IDB 中存储的记录结构 */
interface VRMCacheRecord {
  /** URL 作为主键（keyPath） */
  key: string;
  /** 模型二进制数据 */
  arrayBuffer: ArrayBuffer;
  /** 写入时间戳（Date.now()） */
  timestamp: number;
  /** 缓存版本号，用于未来模型版本管理 */
  version: string;
}

/** 内存缓存：URL → 加载 Promise，避免重复请求 */
const memoryCache = new Map<string, Promise<VRM>>();

/** IDB 数据库连接 Promise（单例，避免重复打开） */
let dbPromise: Promise<IDBDatabase> | null = null;

/** 打开并初始化 VRM 缓存数据库 */
function openVRMCacheDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
  });
  return dbPromise;
}

/** 从 IDB 读取缓存记录（失败返回 undefined，不抛错） */
async function idbGet(url: string): Promise<VRMCacheRecord | undefined> {
  try {
    const db = await openVRMCacheDB();
    return await new Promise<VRMCacheRecord | undefined>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readonly');
      const req = tx.objectStore(STORE_NAME).get(url);
      req.onsuccess = () => resolve(req.result as VRMCacheRecord | undefined);
      req.onerror = () => reject(req.error);
    });
  } catch (err) {
    log.warn('IDB 读取失败，将回退到 HTTP', { url, error: String(err) });
    return undefined;
  }
}

/** 写入 IDB 缓存记录（失败仅记录日志，不影响加载） */
async function idbPut(record: VRMCacheRecord): Promise<void> {
  try {
    const db = await openVRMCacheDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).put(record);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    log.warn('IDB 写入失败（不影响本次加载）', { url: record.key, error: String(err) });
  }
}

/** 删除单条 IDB 缓存（失败仅记录日志） */
async function idbDelete(url: string): Promise<void> {
  try {
    const db = await openVRMCacheDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).delete(url);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    log.warn('IDB 删除失败', { url, error: String(err) });
  }
}

/** 清空整个 IDB Store（失败仅记录日志） */
async function idbClear(): Promise<void> {
  try {
    const db = await openVRMCacheDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite');
      tx.objectStore(STORE_NAME).clear();
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch (err) {
    log.warn('IDB 清空失败', { error: String(err) });
  }
}

/** 使用 GLTFLoader + VRMLoaderPlugin 解析 ArrayBuffer 为 VRM */
function parseVRMFromArrayBuffer(
  arrayBuffer: ArrayBuffer,
  resourcePath: string,
): Promise<VRM> {
  return new Promise<VRM>((resolve, reject) => {
    const loader = new GLTFLoader();
    loader.register((parser) => new VRMLoaderPlugin(parser));
    loader.parse(
      arrayBuffer,
      resourcePath,
      (gltf) => {
        const vrm = gltf.userData.vrm as VRM | undefined;
        if (!vrm) {
          reject(new Error('VRM data not found in gltf'));
          return;
        }
        resolve(vrm);
      },
      (err) => reject(err),
    );
  });
}

/** 通过 HTTP 拉取模型二进制数据 */
async function fetchVRMArrayBuffer(url: string): Promise<ArrayBuffer> {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}: ${response.statusText}`);
  }
  return await response.arrayBuffer();
}

/**
 * 加载 VRM 模型（统一入口）
 *
 * 加载优先级：
 *   1. 内存缓存（同一 URL 返回同一 Promise，避免 StrictMode 双重渲染重复加载）
 *   2. IndexedDB 持久化缓存（命中则直接解析 ArrayBuffer，跳过 HTTP）
 *   3. HTTP 拉取 + 解析 + 持久化
 */
export async function loadVRM(url: string): Promise<VRM> {
  // 1. 内存缓存命中
  const cached = memoryCache.get(url);
  if (cached) return cached;

  const promise = (async () => {
    // 2. IndexedDB 命中 → 解析返回
    const record = await idbGet(url);
    if (record) {
      if (record.version !== VRM_CACHE_VERSION) {
        // 版本不匹配：作废旧缓存，走 HTTP
        log.info('IDB 缓存版本不匹配，重新加载', {
          url,
          cached: record.version,
          current: VRM_CACHE_VERSION,
        });
        void idbDelete(url);
      } else {
        try {
          const vrm = await parseVRMFromArrayBuffer(record.arrayBuffer, url);
          log.debug('IDB 缓存命中', { url });
          return vrm;
        } catch (err) {
          log.warn('IDB 缓存解析失败，回退到 HTTP', { url, error: String(err) });
          // 异步清理损坏的缓存，不阻塞本次加载
          void idbDelete(url);
        }
      }
    }

    // 3. HTTP 加载
    const arrayBuffer = await fetchVRMArrayBuffer(url);
    const vrm = await parseVRMFromArrayBuffer(arrayBuffer, url);

    // 异步持久化到 IDB（失败不影响返回）
    void idbPut({
      key: url,
      arrayBuffer,
      timestamp: Date.now(),
      version: VRM_CACHE_VERSION,
    });

    log.debug('HTTP 加载并已持久化', { url });
    return vrm;
  })();

  memoryCache.set(url, promise);

  // HTTP/解析失败时清除内存缓存，允许后续重试
  promise.catch(() => {
    if (memoryCache.get(url) === promise) {
      memoryCache.delete(url);
    }
  });

  return promise;
}

/** 清除内存缓存（可选指定 URL，不传则清空全部） */
export function clearVRMCache(url?: string): void {
  if (url) {
    memoryCache.delete(url);
  } else {
    memoryCache.clear();
  }
}

/** 清除 IndexedDB 持久化缓存（可选指定 URL，不传则清空全部） */
export async function clearVRMCachePersistent(url?: string): Promise<void> {
  if (url) {
    await idbDelete(url);
  } else {
    await idbClear();
  }
}

/** 仅供测试使用：重置模块级状态（内存缓存 + DB 连接） */
export function _resetForTesting(): void {
  memoryCache.clear();
  dbPromise = null;
}
