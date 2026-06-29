// IndexedDB 适配器：封装初始化、CRUD 与批量导入操作
// 将回调式 IDB API Promise 化，便于在 async/await 中使用

/** 数据库名称 */
const DB_NAME = 'signbridge-db';
/** 数据库版本 */
const DB_VERSION = 2;

/** 所有 Object Store 名称 */
export const STORES = {
  VOCABULARY: 'vocabulary',
  MOTION_DATA: 'motion_data',
  CACHE: 'cache',
  COLLECTED_SAMPLES: 'collected_samples',
} as const;

/** Store 配置：keyPath 与索引 */
interface StoreConfig {
  keyPath: string;
  indexes?: string[];
}

/** 各 Store 的结构配置 */
const STORE_CONFIGS: Record<string, StoreConfig> = {
  [STORES.VOCABULARY]: {
    keyPath: 'gloss_id',
    indexes: ['chinese', 'category'],
  },
  [STORES.MOTION_DATA]: {
    keyPath: 'gloss_id',
  },
  [STORES.CACHE]: {
    keyPath: 'key',
  },
  [STORES.COLLECTED_SAMPLES]: {
    keyPath: 'id',
    indexes: ['gloss_id', 'chinese', 'collectedAt'],
  },
};

/**
 * IndexedDB 适配器
 * 单例模式，确保全局共享同一个数据库连接
 */
export class IndexedDBAdapter {
  private db: IDBDatabase | null = null;

  /** 初始化数据库，创建 Object Stores 与索引 */
  async init(): Promise<void> {
    if (this.db) return;

    this.db = await this.openDB();
  }

  /** 打开数据库并处理升级事件 */
  private openDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);

      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result);

      // 首次创建或版本升级时触发
      request.onupgradeneeded = (_event: IDBVersionChangeEvent) => {
        const db = request.result;
        for (const [storeName, config] of Object.entries(STORE_CONFIGS)) {
          // 若已存在则跳过
          if (db.objectStoreNames.contains(storeName)) continue;

          const store = db.createObjectStore(storeName, {
            keyPath: config.keyPath,
          });
          // 创建索引
          config.indexes?.forEach((indexName) => {
            store.createIndex(indexName, indexName, { unique: false });
          });
        }
      };
    });
  }

  /** 确保数据库已初始化，返回可用连接 */
  private ensureDB(): IDBDatabase {
    if (!this.db) {
      throw new Error('IndexedDB 尚未初始化，请先调用 init()');
    }
    return this.db;
  }

  /** 写入单条记录（已存在则覆盖） */
  async put<T>(store: string, value: T): Promise<void> {
    const db = this.ensureDB();
    await this.runTransaction(db, store, 'readwrite', (tx) => {
      tx.objectStore(store).put(value as unknown as object);
    });
  }

  /** 按主键读取单条记录 */
  async get<T>(store: string, key: string): Promise<T | undefined> {
    const db = this.ensureDB();
    return new Promise<T | undefined>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const request = tx.objectStore(store).get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as T | undefined);
    });
  }

  /** 读取全部记录 */
  async getAll<T>(store: string): Promise<T[]> {
    const db = this.ensureDB();
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const request = tx.objectStore(store).getAll();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as T[]);
    });
  }

  /** 按索引值查询记录 */
  async getByIndex<T>(store: string, index: string, value: string): Promise<T[]> {
    const db = this.ensureDB();
    return new Promise<T[]>((resolve, reject) => {
      const tx = db.transaction(store, 'readonly');
      const storeObj = tx.objectStore(store);
      const idx = storeObj.index(index);
      const request = idx.getAll(value);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result as T[]);
    });
  }

  /** 批量写入记录，使用单个事务提升性能 */
  async bulkPut<T>(store: string, values: T[]): Promise<void> {
    if (values.length === 0) return;
    const db = this.ensureDB();
    await this.runTransaction(db, store, 'readwrite', (tx) => {
      const storeObj = tx.objectStore(store);
      values.forEach((value) => {
        storeObj.put(value as unknown as object);
      });
    });
  }

  /** 按主键删除记录 */
  async delete(store: string, key: string): Promise<void> {
    const db = this.ensureDB();
    await this.runTransaction(db, store, 'readwrite', (tx) => {
      tx.objectStore(store).delete(key);
    });
  }

  /** 清空指定 Store 的全部记录 */
  async clear(store: string): Promise<void> {
    const db = this.ensureDB();
    await this.runTransaction(db, store, 'readwrite', (tx) => {
      tx.objectStore(store).clear();
    });
  }

  /**
   * 执行一个事务，并在事务完成时 resolve
   * 封装事务的 oncomplete/onerror 处理，避免重复代码
   */
  private runTransaction(
    db: IDBDatabase,
    store: string,
    mode: IDBTransactionMode,
    action: (tx: IDBTransaction) => void,
  ): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      const tx = db.transaction(store, mode);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
      action(tx);
    });
  }
}

/** 全局单例适配器实例 */
export const idbAdapter = new IndexedDBAdapter();
