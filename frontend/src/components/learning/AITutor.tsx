// AI 陪练模式组件
// 系统出题 → 用户打手语 → 识别评分 → 动态调整难度
// 共享流程由 PracticeFlow 承载，本组件仅提供难度调整逻辑与题目/状态栏渲染
import { useCallback, useMemo, useState, type ReactNode } from 'react';
import AvatarCanvas from '@/components/avatar/AvatarCanvas';
import { PracticeFlow, type LeftPanelContext } from './PracticeFlow';
import type { PracticeScore } from '@/types/recognition';
import type { SignGloss } from '@/types/sign';

const PROMOTE_STREAK = 3;
const PROMOTE_THRESHOLD = 80;
const DEMOTE_THRESHOLD = 60;
const DIFFICULTY_LABELS: Record<number, string> = { 1: '简单', 2: '中等', 3: '困难' };
const PRIMARY_BTN = 'rounded-lg bg-gradient-to-r from-brand-start to-brand-end px-8 py-3 font-medium text-white shadow-md transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50';
const SECONDARY_BTN = 'rounded-lg bg-white/80 px-6 py-3 font-medium text-gray-700 transition-colors hover:bg-white disabled:cursor-not-allowed disabled:opacity-50';

export interface AITutorProps {
  /** 初始难度等级，默认 1 */
  initialDifficulty?: 1 | 2 | 3;
}

/** 语音播报中文词 */
function speak(text: string): void {
  if (!('speechSynthesis' in window)) return;
  window.speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'zh-CN';
  u.rate = 0.9;
  window.speechSynthesis.speak(u);
}

/**
 * AI 陪练模式
 * - 按当前难度出题（文字 + 语音播报）
 * - 连续 3 次 >= 80 分 → 提升难度；< 60 分 → 降低难度
 */
export function AITutor({ initialDifficulty = 1 }: AITutorProps) {
  const [difficulty, setDifficulty] = useState<number>(initialDifficulty);
  const [streak, setStreak] = useState(0);
  const [totalScore, setTotalScore] = useState(0);
  const [roundCount, setRoundCount] = useState(0);

  // 按当前难度筛选词汇，无匹配时回退到全部
  const selectWord = useCallback((words: SignGloss[]): SignGloss | null => {
    const pool = words.filter((w) => w.difficulty === difficulty);
    const candidates = pool.length > 0 ? pool : words;
    return candidates.length > 0 ? candidates[Math.floor(Math.random() * candidates.length)] : null;
  }, [difficulty]);

  // 评分后更新统计并调整连击与难度
  const handleScored = useCallback((result: PracticeScore): void => {
    setTotalScore((p) => p + result.total_score);
    setRoundCount((p) => p + 1);
    if (result.total_score >= PROMOTE_THRESHOLD) {
      setStreak((prev) => {
        const next = prev + 1;
        if (next >= PROMOTE_STREAK && difficulty < 3) {
          setDifficulty((d) => Math.min(3, d + 1));
          return 0;
        }
        return next;
      });
    } else if (result.total_score < DEMOTE_THRESHOLD) {
      setStreak(0);
      setDifficulty((d) => Math.max(1, d - 1));
    }
  }, [difficulty]);

  const avgScore = useMemo(
    () => (roundCount > 0 ? Math.round(totalScore / roundCount) : 0),
    [totalScore, roundCount],
  );

  // 顶部状态栏：难度、连击、已练、平均分
  const renderHeader = useCallback((): ReactNode => {
    const items: [string, string | number, string][] = [
      ['难度等级', `${difficulty} - ${DIFFICULTY_LABELS[difficulty]}`, 'text-brand-start'],
      ['连击', streak, 'text-orange-500'],
      ['已练', roundCount, 'text-gray-700'],
      ['平均分', avgScore, 'text-green-500'],
    ];
    return (
      <div className="flex flex-wrap items-center justify-center gap-4 rounded-xl bg-white/80 p-4">
        {items.map(([label, value, cls], i) => (
          <div key={label} className="flex items-center gap-4">
            {i > 0 && <div className="h-8 w-px bg-gray-300" />}
            <div className="text-center">
              <div className="text-xs text-gray-500">{label}</div>
              <div className={`text-lg font-bold ${cls}`}>{value}</div>
            </div>
          </div>
        ))}
      </div>
    );
  }, [difficulty, streak, roundCount, avgScore]);

  // 左侧面板：题目 + 虚拟人 + 控制按钮
  const renderLeftPanel = useCallback((ctx: LeftPanelContext): ReactNode => {
    const { currentGloss, phase, pose, playGloss, onStart } = ctx;
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-full rounded-xl bg-gradient-to-r from-brand-start to-brand-end p-6 text-center text-white shadow-lg">
          <div className="text-sm opacity-80">请打出以下手语</div>
          {currentGloss ? (
            <div className="mt-2 text-4xl font-bold">{currentGloss.chinese}</div>
          ) : (
            <div className="mt-2 text-2xl">加载中...</div>
          )}
        </div>
        <AvatarCanvas pose={pose} width={400} height={400} />
        {phase === 'idle' && (
          <div className="flex gap-3">
            <button type="button" onClick={onStart} disabled={!currentGloss} className={PRIMARY_BTN}>开始答题</button>
            <button type="button" onClick={() => currentGloss && playGloss(currentGloss.gloss_id)} disabled={!currentGloss} className={SECONDARY_BTN}>查看演示</button>
            <button type="button" onClick={() => currentGloss && speak(currentGloss.chinese)} disabled={!currentGloss} className={SECONDARY_BTN}>🔊 重播</button>
          </div>
        )}
      </div>
    );
  }, []);

  return (
    <PracticeFlow
      selectWord={selectWord}
      onWordSelected={(g) => speak(g.chinese)}
      onScored={handleScored}
      onRetry={(g) => g && speak(g.chinese)}
      renderLeftPanel={renderLeftPanel}
      renderHeader={renderHeader}
      idleHint={'点击"开始答题"启动摄像头'}
    />
  );
}
