// 跟练评分反馈组件
// 展示总评分、三项子评分进度条、文字反馈及操作按钮
import type { PracticeScore } from '@/types/recognition';

/** ScoreFeedback 组件 Props */
export interface ScoreFeedbackProps {
  /** 评分结果，null 时不渲染 */
  score: PracticeScore | null;
  /** 点击"再试一次"回调 */
  onRetry?: () => void;
  /** 点击"下一个词"回调 */
  onNext?: () => void;
}

/** 子评分项配置 */
interface SubScoreItem {
  label: string;
  value: number;
  color: string;
}

/** 根据总分获取显示颜色：红 < 60，橙 < 80，绿 >= 80 */
function getScoreColor(score: number): string {
  if (score >= 80) return 'text-green-500';
  if (score >= 60) return 'text-orange-500';
  return 'text-red-500';
}

/** 根据分数获取进度条背景色 */
function getBarColor(score: number): string {
  if (score >= 80) return 'bg-green-500';
  if (score >= 60) return 'bg-orange-500';
  return 'bg-red-500';
}

/**
 * 评分反馈组件
 * - 大字号显示总分（颜色随分数变化）
 * - 三项子评分进度条（手形、位置、运动方向）
 * - 反馈文字
 * - "再试一次"和"下一个词"按钮
 */
export function ScoreFeedback({ score, onRetry, onNext }: ScoreFeedbackProps) {
  if (!score) return null;

  // 构建子评分列表
  const subScores: SubScoreItem[] = [
    { label: '手形', value: score.handshape_score, color: getBarColor(score.handshape_score) },
    { label: '位置', value: score.position_score, color: getBarColor(score.position_score) },
    { label: '运动方向', value: score.motion_score, color: getBarColor(score.motion_score) },
  ];

  return (
    <div className="w-full rounded-2xl bg-white/90 p-6 shadow-lg backdrop-blur">
      {/* 总评分 */}
      <div className="mb-4 text-center">
        <div className="text-sm text-gray-500">总评分</div>
        <div className={`text-5xl font-bold ${getScoreColor(score.total_score)}`}>
          {score.total_score}
        </div>
      </div>

      {/* 子评分进度条 */}
      <div className="mb-4 space-y-3">
        {subScores.map((item) => (
          <div key={item.label}>
            <div className="mb-1 flex justify-between text-sm">
              <span className="text-gray-600">{item.label}</span>
              <span className="font-medium text-gray-800">{item.value}</span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200">
              <div
                className={`h-full rounded-full transition-all duration-500 ${item.color}`}
                style={{ width: `${item.value}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      {/* 反馈文字 */}
      <div className="mb-4 rounded-lg bg-gray-50 p-3 text-center text-sm text-gray-700">
        {score.feedback}
      </div>

      {/* 操作按钮 */}
      <div className="flex gap-3">
        <button
          type="button"
          onClick={onRetry}
          className="flex-1 rounded-lg bg-gray-200 px-4 py-2 font-medium text-gray-700 transition-colors hover:bg-gray-300"
        >
          再试一次
        </button>
        <button
          type="button"
          onClick={onNext}
          className="flex-1 rounded-lg bg-gradient-to-r from-brand-start to-brand-end px-4 py-2 font-medium text-white transition-transform hover:scale-105"
        >
          下一个词
        </button>
      </div>
    </div>
  );
}
