// 跟练模式组件
// 流程：选词 → 虚拟人演示 → 用户模仿 → 摄像头捕捉 → DTW 评分 → 反馈
// 共享流程由 PracticeFlow 承载，本组件仅提供出题策略与左侧面板渲染
import { useCallback, type ReactNode } from 'react';
import AvatarCanvas from '@/components/avatar/AvatarCanvas';
import { PracticeFlow, type LeftPanelContext } from './PracticeFlow';
import { useAvatarPlayer } from '@/hooks/useAvatarPlayer';
import type { SignGloss } from '@/types/sign';

export interface PracticeModeProps {
  /** 初始词汇（可选） */
  initialGloss?: SignGloss;
}

/** 随机选词策略 */
function selectRandomWord(words: SignGloss[]): SignGloss | null {
  return words.length > 0 ? words[Math.floor(Math.random() * words.length)] : null;
}

/** 跟练模式：随机选词 → 演示 → 模仿 → DTW 评分 → 反馈 */
export function PracticeMode({ initialGloss }: PracticeModeProps) {
  const { playGloss } = useAvatarPlayer();

  // 渲染左侧面板：词汇信息 + 虚拟人 + 控制按钮
  const renderLeftPanel = useCallback((ctx: LeftPanelContext): ReactNode => {
    const { currentGloss, phase, isPlaying, pose, onStart, onNext } = ctx;
    return (
      <div className="flex flex-col items-center gap-4">
        <div className="w-full rounded-xl bg-white/80 p-4 text-center">
          {currentGloss ? (
            <>
              <div className="text-2xl font-bold text-gray-800">{currentGloss.chinese}</div>
              <div className="mt-1 text-sm text-gray-500">
                {currentGloss.category} · 难度 {'★'.repeat(currentGloss.difficulty)}
              </div>
              {currentGloss.english && (
                <div className="mt-1 text-xs text-gray-400">{currentGloss.english}</div>
              )}
            </>
          ) : (
            <div className="text-gray-500">加载中...</div>
          )}
        </div>

        <AvatarCanvas pose={pose} width={400} height={400} />

        {phase === 'idle' && (
          <div className="flex flex-col items-center gap-2">
            <button
              type="button"
              onClick={onStart}
              disabled={!currentGloss || isPlaying}
              className="rounded-lg bg-gradient-to-r from-brand-start to-brand-end px-8 py-3 font-medium text-white shadow-md transition-transform hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isPlaying ? '正在演示...' : '开始模仿'}
            </button>
            <button
              type="button"
              onClick={onNext}
              className="text-sm text-gray-500 underline hover:text-gray-700"
            >
              换一个词
            </button>
          </div>
        )}
      </div>
    );
  }, []);

  return (
    <PracticeFlow
      initialGloss={initialGloss}
      selectWord={selectRandomWord}
      onWordSelected={(g) => playGloss(g.gloss_id)}
      onRetry={(g) => g && playGloss(g.gloss_id)}
      renderLeftPanel={renderLeftPanel}
      idleHint={'点击"开始模仿"启动摄像头'}
    />
  );
}
