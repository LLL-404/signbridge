// 性能监控 Hook：采集 Web Vitals 和自定义性能指标
// 包括 FCP/LCP/TTI/FID/CLS 以及 TF.js 推理耗时和 3D 渲染帧率

import { useEffect, useRef, useState, useCallback } from 'react';

/** Web Vitals 指标 */
export interface WebVitals {
  fcp: number | null;       // First Contentful Paint (ms)
  lcp: number | null;       // Largest Contentful Paint (ms)
  fid: number | null;       // First Input Delay (ms)
  cls: number | null;       // Cumulative Layout Shift
  ttfb: number | null;      // Time to First Byte (ms)
}

/** PerformanceEventTiming 类型扩展（TypeScript 内置类型不完整） */
interface PerformanceEventTiming extends PerformanceEntry {
  processingStart: number;
}

/** 自定义性能指标 */
export interface CustomMetrics {
  tfjsInferenceTime: number | null;  // TF.js 模型推理耗时 (ms)
  renderFps: number | null;          // 3D 渲染帧率
  memoryUsage: number | null;        // 内存使用量 (MB，如可用)
}

/** 完整性能报告 */
export interface PerformanceReport {
  vitals: WebVitals;
  metrics: CustomMetrics;
  timestamp: number;
}

/** 性能监控 Hook */
export function usePerformanceMonitor(enabled: boolean = true) {
  const [report, setReport] = useState<PerformanceReport>({
    vitals: { fcp: null, lcp: null, fid: null, cls: null, ttfb: null },
    metrics: { tfjsInferenceTime: null, renderFps: null, memoryUsage: null },
    timestamp: Date.now(),
  });

  const clsValue = useRef(0);
  const frameCount = useRef(0);
  const lastFpsUpdate = useRef(performance.now());

  // 采集 Web Vitals
  useEffect(() => {
    if (!enabled) return;

    // TTFB
    const navEntry = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;
    if (navEntry) {
      setReport((prev) => ({
        ...prev,
        vitals: { ...prev.vitals, ttfb: navEntry.responseStart - navEntry.requestStart },
      }));
    }

    // FCP
    const fcpObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          setReport((prev) => ({
            ...prev,
            vitals: { ...prev.vitals, fcp: entry.startTime },
          }));
        }
      }
    });
    fcpObserver.observe({ type: 'paint', buffered: true });

    // LCP
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      if (lastEntry) {
        setReport((prev) => ({
          ...prev,
          vitals: { ...prev.vitals, lcp: lastEntry.startTime },
        }));
      }
    });
    lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true });

    // FID
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        const eventEntry = entry as PerformanceEventTiming;
        setReport((prev) => ({
          ...prev,
          vitals: {
            ...prev.vitals,
            fid: eventEntry.processingStart - eventEntry.startTime,
          },
        }));
      }
    });
    fidObserver.observe({ type: 'first-input', buffered: true });

    // CLS
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries() as PerformanceEntry[]) {
        const layoutShift = entry as unknown as { hadRecentInput: boolean; value: number };
        if (!layoutShift.hadRecentInput) {
          clsValue.current += layoutShift.value;
          setReport((prev) => ({
            ...prev,
            vitals: { ...prev.vitals, cls: clsValue.current },
          }));
        }
      }
    });
    clsObserver.observe({ type: 'layout-shift', buffered: true });

    return () => {
      fcpObserver.disconnect();
      lcpObserver.disconnect();
      fidObserver.disconnect();
      clsObserver.disconnect();
    };
  }, [enabled]);

  // 内存监控（Chrome only）
  useEffect(() => {
    if (!enabled) return;
    const interval = setInterval(() => {
      const mem = (performance as unknown as { memory?: { usedJSHeapSize: number } }).memory;
      if (mem) {
        setReport((prev) => ({
          ...prev,
          metrics: {
            ...prev.metrics,
            memoryUsage: mem.usedJSHeapSize / 1024 / 1024,
          },
        }));
      }
    }, 5000);
    return () => clearInterval(interval);
  }, [enabled]);

  /** 记录 TF.js 推理耗时 */
  const recordInference = useCallback((timeMs: number) => {
    setReport((prev) => ({
      ...prev,
      metrics: { ...prev.metrics, tfjsInferenceTime: timeMs },
    }));
  }, []);

  /** 记录渲染帧（用于计算 FPS） */
  const recordFrame = useCallback(() => {
    frameCount.current++;
    const now = performance.now();
    const elapsed = now - lastFpsUpdate.current;
    if (elapsed >= 1000) {
      const fps = Math.round((frameCount.current * 1000) / elapsed);
      setReport((prev) => ({
        ...prev,
        metrics: { ...prev.metrics, renderFps: fps },
      }));
      frameCount.current = 0;
      lastFpsUpdate.current = now;
    }
  }, []);

  /** 获取性能评分（0-100） */
  const getScore = useCallback((): number => {
    const { fcp, lcp, fid, cls } = report.vitals;
    let score = 100;
    if (fcp !== null) {
      if (fcp > 3000) score -= 20;
      else if (fcp > 1800) score -= 10;
    }
    if (lcp !== null) {
      if (lcp > 4000) score -= 25;
      else if (lcp > 2500) score -= 15;
    }
    if (fid !== null) {
      if (fid > 300) score -= 20;
      else if (fid > 100) score -= 10;
    }
    if (cls !== null) {
      if (cls > 0.25) score -= 20;
      else if (cls > 0.1) score -= 10;
    }
    return Math.max(0, score);
  }, [report.vitals]);

  return { report, recordInference, recordFrame, getScore };
}
