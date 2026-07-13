/**
 * 统一分级日志模块
 * 提供 debug/info/warn/error 四个级别，支持模块前缀和 ring buffer
 */

/** 日志级别 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 日志条目 */
export interface LogEntry {
  timestamp: number;       // performance.now()
  date: string;            // ISO 时间字符串
  level: LogLevel;
  module: string;          // 模块名
  message: string;
  data?: unknown[];        // 附加参数
}

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

const RING_BUFFER_SIZE = 200;

/** 主 logger 类 */
class Logger {
  private level: LogLevel;
  private ringBuffer: LogEntry[] = [];
  private bufferListeners: Set<(entries: LogEntry[]) => void> = new Set();

  constructor() {
    // 开发环境 debug，生产环境 warn
    this.level = import.meta.env.DEV ? 'debug' : 'warn';
  }

  /** 设置日志级别 */
  setLevel(level: LogLevel): void { this.level = level; }

  /** 获取当前级别 */
  getLevel(): LogLevel { return this.level; }

  /** 创建模块 logger */
  module(name: string): ModuleLogger {
    return new ModuleLogger(name, this);
  }

  /** 内部方法：写入日志 */
  log(level: LogLevel, module: string, message: string, data?: unknown[]): void {
    // 级别过滤
    if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[this.level]) return;

    const now = performance.now();
    const entry: LogEntry = {
      timestamp: now,
      date: new Date().toISOString(),
      level,
      module,
      message,
      data: data?.length ? data : undefined,
    };

    // 写入 ring buffer
    this.ringBuffer.push(entry);
    if (this.ringBuffer.length > RING_BUFFER_SIZE) {
      this.ringBuffer.shift();
    }

    // 输出到 console
    const time = new Date().toTimeString().slice(0, 8);
    const ms = String(now % 1000).padStart(3, '0');
    const prefix = `[${time}.${ms}] [${level.toUpperCase().padEnd(5)}] [${module}]`;
    
    const consoleMethod = level === 'debug' ? console.debug 
                        : level === 'info' ? console.info
                        : level === 'warn' ? console.warn 
                        : console.error;
    
    if (data?.length) {
      consoleMethod(prefix, message, ...data);
    } else {
      consoleMethod(prefix, message);
    }

    // 通知监听器
    for (const listener of this.bufferListeners) {
      listener([...this.ringBuffer]);
    }
  }

  /** 获取 ring buffer 副本 */
  getBuffer(): LogEntry[] { return [...this.ringBuffer]; }

  /** 清空 ring buffer */
  clearBuffer(): void { this.ringBuffer = []; }

  /** 监听 ring buffer 变化 */
  onBufferChange(listener: (entries: LogEntry[]) => void): () => void {
    this.bufferListeners.add(listener);
    return () => this.bufferListeners.delete(listener);
  }
}

/** 模块 logger */
class ModuleLogger {
  constructor(private moduleName: string, private parent: Logger) {}

  debug(message: string, ...data: unknown[]): void {
    this.parent.log('debug', this.moduleName, message, data);
  }

  info(message: string, ...data: unknown[]): void {
    this.parent.log('info', this.moduleName, message, data);
  }

  warn(message: string, ...data: unknown[]): void {
    this.parent.log('warn', this.moduleName, message, data);
  }

  error(message: string, ...data: unknown[]): void {
    this.parent.log('error', this.moduleName, message, data);
  }
}

/** 全局 logger 单例 */
export const logger = new Logger();
