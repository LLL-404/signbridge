/**
 * 启动计时器
 * 使用 performance.mark/measure 测量各阶段耗时
 * 每个阶段开始/结束/失败时输出结构化日志
 */
import { logger } from './logger';

const log = logger.module('Startup');

/** 阶段状态 */
export type PhaseStatus = 'running' | 'success' | 'failed';

/** 阶段记录 */
export interface PhaseRecord {
  name: string;
  label: string;          // 中文标签，用于 UI 显示
  status: PhaseStatus;
  startTime: number;      // performance.now()
  duration?: number;      // ms（完成或失败时填入）
  error?: string;
}

class StartupTrackerClass {
  private phases = new Map<string, PhaseRecord>();
  private currentPhase: string | null = null;
  private listeners: Set<(phases: PhaseRecord[]) => void> = new Set();

  /** 开始一个阶段 */
  start(name: string, label?: string): void {
    const record: PhaseRecord = {
      name,
      label: label ?? name,
      status: 'running',
      startTime: performance.now(),
    };
    this.phases.set(name, record);
    this.currentPhase = name;
    log.info(`阶段开始: ${label ?? name}`);
    
    // performance.mark
    try {
      performance.mark(`startup:${name}:start`);
    } catch { /* mark 可能重复，忽略 */ }
    
    this.notifyListeners();
  }

  /** 结束一个阶段（成功） */
  end(name: string): void {
    const record = this.phases.get(name);
    if (!record) return;
    
    record.duration = performance.now() - record.startTime;
    record.status = 'success';
    
    try {
      performance.mark(`startup:${name}:end`);
      performance.measure(`startup:${name}`, `startup:${name}:start`, `startup:${name}:end`);
    } catch { /* 忽略 */ }
    
    log.info(`阶段完成: ${record.label} (${record.duration.toFixed(0)}ms)`);
    if (this.currentPhase === name) this.currentPhase = null;
    this.notifyListeners();
  }

  /** 标记阶段失败 */
  fail(name: string, error: unknown): void {
    const record = this.phases.get(name);
    if (!record) return;
    
    record.duration = performance.now() - record.startTime;
    record.status = 'failed';
    record.error = error instanceof Error ? error.message : String(error);
    
    log.error(`阶段失败: ${record.label} - ${record.error}`);
    if (this.currentPhase === name) this.currentPhase = null;
    this.notifyListeners();
  }

  /** 获取当前运行中的阶段 */
  getCurrentPhase(): PhaseRecord | null {
    return this.currentPhase ? this.phases.get(this.currentPhase) ?? null : null;
  }

  /** 获取所有阶段记录 */
  getReport(): PhaseRecord[] {
    return Array.from(this.phases.values());
  }

  /** 获取总耗时 */
  getTotalDuration(): number {
    const records = Array.from(this.phases.values());
    if (records.length === 0) return 0;
    const first = Math.min(...records.map(r => r.startTime));
    const last = Math.max(...records.map(r => r.startTime + (r.duration ?? 0)));
    return last - first;
  }

  /** 监听阶段变化 */
  onPhaseChange(listener: (phases: PhaseRecord[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyListeners(): void {
    const snapshot = this.getReport();
    for (const listener of this.listeners) {
      listener(snapshot);
    }
  }
}

/** 全局 StartupTracker 单例 */
export const startupTracker = new StartupTrackerClass();
