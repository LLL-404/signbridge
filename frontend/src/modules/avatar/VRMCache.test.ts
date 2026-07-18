/**
 * @file VRMCache.test.ts
 * @description VRM 分级加载缓存单元测试
 *
 * 测试覆盖：
 *   - 内存缓存命中：第二次调用直接返回缓存 Promise，不发起 HTTP/IDB
 *   - IndexedDB 命中：清空内存缓存后从 IDB 读取并解析
 *   - IndexedDB 未命中：首次调用从 HTTP 加载并持久化到 IDB
 *   - IDB 读取失败回退到 HTTP
 *   - IDB 缓存解析失败回退到 HTTP
 *   - IDB 写入失败不阻塞加载
 *   - 缓存版本不匹配作废旧缓存
 *   - HTTP 失败清除内存缓存允许重试
 *   - clearVRMCache 清除内存缓存
 *   - clearVRMCachePersistent 清除 IDB 缓存（全部 / 单条）
 *
 * 通过 vi.mock 隔离 GLTFLoader / VRMLoaderPlugin / logger 依赖，
 * 并提供 fake-indexeddb 模拟 IDB 行为。
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ===== Mock GLTFLoader：暴露 parseSpy / registerSpy 供测试断言 =====
// 使用 class 形式而非 vi.fn().mockImplementation，避免 mockReset/restoreAllMocks
// 清空实现后 new GLTFLoader() 返回缺少 register/parse 方法的空实例
const { parseSpy, registerSpy } = vi.hoisted(() => ({
  parseSpy: vi.fn(),
  registerSpy: vi.fn(),
}));

vi.mock('three/examples/jsm/loaders/GLTFLoader.js', () => ({
  GLTFLoader: class MockGLTFLoader {
    register = registerSpy;
    parse = parseSpy;
  },
}));

// ===== Mock VRMLoaderPlugin（VRM 类型在编译期擦除，无需 mock） =====
vi.mock('@pixiv/three-vrm', () => ({
  VRMLoaderPlugin: vi.fn(),
}));

// ===== Mock logger，避免 import.meta.env 依赖 =====
vi.mock('@/modules/debug/logger', () => ({
  logger: {
    module: () => ({
      debug: vi.fn(),
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
    }),
  },
}));

import {
  loadVRM,
  clearVRMCache,
  clearVRMCachePersistent,
  _resetForTesting,
} from './VRMCache';

// ===== Fake IndexedDB =====
// jsdom 不提供 indexedDB，这里实现一个最小可用的 fake
// 通过 queueMicrotask 触发请求回调，通过 setTimeout(0) 触发事务 oncomplete（确保晚于请求回调）

const FAKE_STORE_NAME = 'vrm_cache';

interface FakeReq<T = unknown> {
  result: T;
  error: unknown;
  onsuccess: ((ev: Event) => void) | null;
  onerror: ((ev: Event) => void) | null;
}

function makeReq<T = unknown>(): FakeReq<T> {
  return { result: undefined as T, error: null, onsuccess: null, onerror: null };
}

interface FakeIDBOptions {
  failOpen?: boolean;
  failGet?: boolean;
  failPut?: boolean;
  failDelete?: boolean;
  failClear?: boolean;
}

/**
 * 创建 fake indexedDB
 * 返回对象包含 _seed 方法用于预置缓存记录（测试版本不匹配等场景）
 */
function createFakeIndexedDB(opts: FakeIDBOptions = {}) {
  const stores = new Map<string, Map<string, unknown>>();

  function createStoreApi(storeName: string, tx: { _failed: boolean }) {
    return {
      get(key: string) {
        const req = makeReq();
        queueMicrotask(() => {
          if (opts.failGet) {
            req.error = new Error('fake get error');
            req.onerror?.({ target: req } as unknown as Event);
          } else {
            const storeMap = stores.get(storeName) ?? new Map();
            req.result = storeMap.get(key);
            req.onsuccess?.({ target: req } as unknown as Event);
          }
        });
        return req;
      },
      put(value: unknown) {
        const req = makeReq();
        queueMicrotask(() => {
          if (opts.failPut) {
            req.error = new Error('fake put error');
            req.onerror?.({ target: req } as unknown as Event);
            tx._failed = true;
          } else {
            let storeMap = stores.get(storeName);
            if (!storeMap) {
              storeMap = new Map();
              stores.set(storeName, storeMap);
            }
            const record = value as { key: string };
            storeMap.set(record.key, value);
            req.result = undefined;
            req.onsuccess?.({ target: req } as unknown as Event);
          }
        });
        return req;
      },
      delete(key: string) {
        const req = makeReq();
        queueMicrotask(() => {
          if (opts.failDelete) {
            req.error = new Error('fake delete error');
            req.onerror?.({ target: req } as unknown as Event);
            tx._failed = true;
          } else {
            stores.get(storeName)?.delete(key);
            req.result = undefined;
            req.onsuccess?.({ target: req } as unknown as Event);
          }
        });
        return req;
      },
      clear() {
        const req = makeReq();
        queueMicrotask(() => {
          if (opts.failClear) {
            req.error = new Error('fake clear error');
            req.onerror?.({ target: req } as unknown as Event);
            tx._failed = true;
          } else {
            stores.get(storeName)?.clear();
            req.result = undefined;
            req.onsuccess?.({ target: req } as unknown as Event);
          }
        });
        return req;
      },
    };
  }

  const fakeDB = {
    objectStoreNames: { contains: (s: string) => stores.has(s) },
    createObjectStore(s: string) {
      if (!stores.has(s)) stores.set(s, new Map());
      return createStoreApi(s, { _failed: false });
    },
    transaction(storeName: string) {
      const tx: { _failed: boolean; oncomplete: ((ev: Event) => void) | null; onerror: ((ev: Event) => void) | null; error: unknown } = {
        _failed: false,
        oncomplete: null,
        onerror: null,
        error: null,
      };
      const api = createStoreApi(storeName, tx);
      const txProxy = {
        objectStore: () => api,
        oncomplete: null as ((ev: Event) => void) | null,
        onerror: null as ((ev: Event) => void) | null,
        error: null as unknown,
        get _failed() { return tx._failed; },
        set _failed(v: boolean) { tx._failed = v; },
      };
      // 用 setTimeout(0) 确保 oncomplete/onerror 在所有请求微任务之后触发
      setTimeout(() => {
        if (tx._failed) {
          txProxy.error = new Error('transaction failed');
          txProxy.onerror?.({ target: txProxy } as unknown as Event);
        } else {
          txProxy.oncomplete?.({ target: txProxy } as unknown as Event);
        }
      }, 0);
      return txProxy;
    },
  };

  const fakeIDB = {
    open() {
      const request: {
        result: typeof fakeDB | null;
        error: unknown;
        onsuccess: ((ev: Event) => void) | null;
        onerror: ((ev: Event) => void) | null;
        onupgradeneeded: ((ev: Event) => void) | null;
      } = {
        result: null,
        error: null,
        onsuccess: null,
        onerror: null,
        onupgradeneeded: null,
      };
      queueMicrotask(() => {
        if (opts.failOpen) {
          request.error = new Error('fake open error');
          request.onerror?.({ target: request } as unknown as Event);
        } else {
          request.result = fakeDB;
          if (!stores.has(FAKE_STORE_NAME)) {
            stores.set(FAKE_STORE_NAME, new Map());
            request.onupgradeneeded?.({ target: request } as unknown as Event);
          }
          request.onsuccess?.({ target: request } as unknown as Event);
        }
      });
      return request;
    },
    /** 预置缓存记录（测试版本不匹配等场景） */
    _seed(key: string, value: unknown) {
      let storeMap = stores.get(FAKE_STORE_NAME);
      if (!storeMap) {
        storeMap = new Map();
        stores.set(FAKE_STORE_NAME, storeMap);
      }
      storeMap.set(key, value);
    },
  };

  return fakeIDB as unknown as typeof indexedDB & { _seed: (key: string, value: unknown) => void };
}

describe('VRMCache', () => {
  const TEST_URL = 'https://example.com/test.vrm';
  const TEST_BUFFER = new ArrayBuffer(16);

  let originalIndexedDB: typeof indexedDB | undefined;
  let originalFetch: typeof fetch;

  beforeEach(() => {
    _resetForTesting();
    originalIndexedDB = globalThis.indexedDB;
    originalFetch = globalThis.fetch;

    globalThis.indexedDB = createFakeIndexedDB();
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      arrayBuffer: () => Promise.resolve(TEST_BUFFER),
    });

    parseSpy.mockReset();
    registerSpy.mockReset();
    // 默认 parse 成功：返回带 vrm 的 gltf
    parseSpy.mockImplementation((_buf, _path, onLoad) => {
      onLoad({ userData: { vrm: { _testUrl: TEST_URL } } });
    });
  });

  afterEach(() => {
    // 还原全局 indexedDB / fetch（类型断言：测试环境中可能为 undefined）
    if (originalIndexedDB !== undefined) {
      globalThis.indexedDB = originalIndexedDB;
    }
    globalThis.fetch = originalFetch;
  });

  /** 等待 IDB 写入完成（setTimeout 0 触发 oncomplete） */
  function flushIDBTimers(): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, 10));
  }

  it('内存缓存命中：第二次调用应直接返回缓存 Promise，不发起 HTTP/IDB', async () => {
    await loadVRM(TEST_URL);
    const firstFetchCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    await loadVRM(TEST_URL);
    const secondFetchCount = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls.length;

    expect(secondFetchCount).toBe(firstFetchCount);
  });

  it('IndexedDB 命中：清空内存缓存后应从 IDB 读取并解析', async () => {
    await loadVRM(TEST_URL); // HTTP + 持久化
    await flushIDBTimers();
    clearVRMCache(); // 清空内存

    parseSpy.mockClear();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();

    await loadVRM(TEST_URL); // 应从 IDB 读取

    expect(globalThis.fetch).not.toHaveBeenCalled();
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it('IndexedDB 未命中：首次调用应从 HTTP 加载并持久化到 IDB', async () => {
    const vrm = await loadVRM(TEST_URL);

    expect(vrm).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledTimes(1);

    // 等待 IDB 写入完成
    await flushIDBTimers();

    // 再次加载（清空内存后）应从 IDB 命中，不发起 HTTP
    clearVRMCache();
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
    await loadVRM(TEST_URL);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('IDB 读取失败时应回退到 HTTP', async () => {
    // 重新设置 IDB 使 get 失败
    globalThis.indexedDB = createFakeIndexedDB({ failGet: true });
    _resetForTesting();
    clearVRMCache();

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
    parseSpy.mockClear();
    parseSpy.mockImplementation((_buf, _path, onLoad) => {
      onLoad({ userData: { vrm: { _testUrl: TEST_URL } } });
    });

    const vrm = await loadVRM(TEST_URL);

    expect(vrm).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledTimes(1);
  });

  it('IDB 缓存解析失败时应回退到 HTTP', async () => {
    // 先正常加载持久化
    await loadVRM(TEST_URL);
    await flushIDBTimers();
    clearVRMCache();

    // 第一次 parse（IDB 命中）失败，第二次 parse（HTTP）成功
    parseSpy.mockReset();
    parseSpy.mockImplementation((_buf, _path, onLoad) => {
      onLoad({ userData: { vrm: { _testUrl: TEST_URL } } });
    });
    parseSpy.mockImplementationOnce((_buf, _path, _onLoad, onError) => {
      onError(new Error('IDB 缓存解析失败'));
    });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
    const vrm = await loadVRM(TEST_URL);

    expect(vrm).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    expect(parseSpy).toHaveBeenCalledTimes(2);
  });

  it('IDB 写入失败不应阻塞加载', async () => {
    globalThis.indexedDB = createFakeIndexedDB({ failPut: true });
    _resetForTesting();
    clearVRMCache();

    const vrm = await loadVRM(TEST_URL);

    expect(vrm).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
    // 等待 IDB 写入失败处理（不应抛出未捕获异常）
    await flushIDBTimers();
  });

  it('缓存版本不匹配时应作废旧缓存并走 HTTP', async () => {
    const fakeIDB = createFakeIndexedDB();
    globalThis.indexedDB = fakeIDB;
    _resetForTesting();
    clearVRMCache();

    // 预置旧版本缓存记录
    fakeIDB._seed(TEST_URL, {
      key: TEST_URL,
      arrayBuffer: TEST_BUFFER,
      timestamp: Date.now(),
      version: '0', // 旧版本
    });

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
    const vrm = await loadVRM(TEST_URL);

    expect(vrm).toBeDefined();
    // 版本不匹配 → 走 HTTP
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('HTTP 失败时应清除内存缓存 Promise 允许重试', async () => {
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error('network error'),
    );

    await expect(loadVRM(TEST_URL)).rejects.toThrow('network error');

    // 内存缓存应已清除，重试应再次调用 fetch
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockResolvedValueOnce({
      ok: true,
      arrayBuffer: () => Promise.resolve(TEST_BUFFER),
    });

    const vrm = await loadVRM(TEST_URL);
    expect(vrm).toBeDefined();
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
  });

  it('clearVRMCache 应清除内存缓存', async () => {
    await loadVRM(TEST_URL); // HTTP + IDB 持久化
    await flushIDBTimers();
    clearVRMCache();

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
    await loadVRM(TEST_URL); // 内存已清空，应命中 IDB

    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('clearVRMCachePersistent() 应清空全部 IDB 缓存', async () => {
    await loadVRM(TEST_URL); // HTTP + 持久化
    await flushIDBTimers();

    await clearVRMCachePersistent(); // 清空 IDB
    clearVRMCache(); // 清空内存

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
    await loadVRM(TEST_URL);

    // IDB 已清空，应回退到 HTTP
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('clearVRMCachePersistent(url) 应仅清除指定 URL 的 IDB 缓存', async () => {
    await loadVRM(TEST_URL);
    await loadVRM('https://example.com/other.vrm');
    await flushIDBTimers();

    await clearVRMCachePersistent(TEST_URL);
    clearVRMCache();

    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
    // TEST_URL 应从 HTTP 重新加载
    await loadVRM(TEST_URL);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // other.vrm 仍应从 IDB 命中
    (globalThis.fetch as ReturnType<typeof vi.fn>).mockClear();
    await loadVRM('https://example.com/other.vrm');
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });
});
