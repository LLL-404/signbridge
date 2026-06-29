import { useState, useEffect } from 'react';
import { usePerformanceMonitor } from '@/hooks/usePerformanceMonitor';

/** 指标显示项 */
function MetricItem({ label, value, unit, good, warn, higherIsBetter }: {
  label: string;
  value: number | null;
  unit: string;
  good: number;
  warn: number;
  higherIsBetter?: boolean;
}) {
  if (value === null) {
    return (
      <div className="flex justify-between items-center py-1">
        <span className="text-[10px] text-content-muted">{label}</span>
        <span className="text-[10px] text-content-muted font-mono">—</span>
      </div>
    );
  }
  const isGood = higherIsBetter ? value >= good : value <= good;
  const isWarn = higherIsBetter ? value >= warn : value <= warn;
  const color = isGood ? 'text-green-400' : isWarn ? 'text-amber-400' : 'text-red-400';
  return (
    <div className="flex justify-between items-center py-1">
      <span className="text-[10px] text-content-muted">{label}</span>
      <span className={`text-[11px] font-mono ${color}`}>
        {typeof value === 'number' ? (value < 10 && !higherIsBetter ? value.toFixed(2) : Math.round(value)) : value}{unit}
      </span>
    </div>
  );
}

/** 性能面板：右下角悬浮，显示 Web Vitals 和自定义指标 */
export function PerformancePanel() {
  const [expanded, setExpanded] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const { report, getScore } = usePerformanceMonitor(enabled);
  const score = getScore();

  useEffect(() => {
    // 通过键盘快捷键 Ctrl+Shift+P 切换面板
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.shiftKey && e.key === 'P') {
        e.preventDefault();
        setEnabled((prev) => !prev);
        setExpanded((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (!enabled) return null;

  const scoreColor = score >= 80 ? 'text-green-400 bg-green-500/20'
    : score >= 50 ? 'text-amber-400 bg-amber-500/20'
    : 'text-red-400 bg-red-500/20';

  return (
    <div className="fixed bottom-4 right-4 z-50 font-sans">
      {expanded ? (
        <div className="bg-dark-900/95 backdrop-blur-md border border-dark-600 rounded-lg shadow-xl w-64 text-content-primary animate-fade-in">
          <div className="flex items-center justify-between p-2 border-b border-dark-700">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">性能监控</span>
              <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${scoreColor}`}>
                {score}
              </span>
            </div>
            <button
              onClick={() => setExpanded(false)}
              className="text-content-muted hover:text-content-primary text-xs"
            >
              ✕
            </button>
          </div>

          <div className="p-3 space-y-3">
            <div>
              <div className="text-[10px] font-semibold text-content-secondary uppercase tracking-wider mb-1">Web Vitals</div>
              <MetricItem label="FCP (首屏绘制)" value={report.vitals.fcp} unit="ms" good={1800} warn={3000} />
              <MetricItem label="LCP (最大内容)" value={report.vitals.lcp} unit="ms" good={2500} warn={4000} />
              <MetricItem label="FID (首次输入)" value={report.vitals.fid} unit="ms" good={100} warn={300} />
              <MetricItem label="CLS (布局偏移)" value={report.vitals.cls} unit="" good={0.1} warn={0.25} />
              <MetricItem label="TTFB (首字节)" value={report.vitals.ttfb} unit="ms" good={500} warn={1500} />
            </div>

            <div className="border-t border-dark-700 pt-2">
              <div className="text-[10px] font-semibold text-content-secondary uppercase tracking-wider mb-1">自定义指标</div>
              <MetricItem label="渲染帧率" value={report.metrics.renderFps} unit="fps" good={50} warn={30} higherIsBetter />
              <MetricItem label="TF.js推理" value={report.metrics.tfjsInferenceTime} unit="ms" good={50} warn={200} />
              <MetricItem label="内存使用" value={report.metrics.memoryUsage} unit="MB" good={200} warn={500} />
            </div>
          </div>

          <div className="p-2 border-t border-dark-700 text-[9px] text-content-muted text-center">
            Ctrl+Shift+P 切换
          </div>
        </div>
      ) : (
        <button
          onClick={() => setExpanded(true)}
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border backdrop-blur-md text-xs font-mono ${scoreColor} border-current/30`}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-current animate-pulse-soft" />
          PERF {score}
        </button>
      )}
    </div>
  );
}
