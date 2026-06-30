import { useCallback, useEffect, useRef, useState } from 'react';
import AvatarCanvas from '@/components/avatar/AvatarCanvas';
import NonManualMarkerOverlay from '@/components/avatar/NonManualMarkerOverlay';
import { useAvatarPlayer } from '@/hooks/useAvatarPlayer';
import { grammarEngine } from '@/modules/grammar/GrammarEngine';
import {
  getAllScenarios,
  getScenario,
  type DemoScenario,
  type DemoStep,
} from '@/data/demoScenarios';

const CATEGORY_LABELS: Record<string, string> = {
  medical: '🏥 医院问诊',
  government: '🏛️ 政务办事',
  social: '💬 日常社交',
  education: '📖 课堂教学',
};

const SPEAKER_LABELS: Record<string, string> = {
  hearing: '🗣️ 健听人',
  deaf: '✋ 听障人',
};

const SPEAKER_COLORS: Record<string, string> = {
  hearing: 'bg-accent-500/20 border-accent-500/40 text-accent-300',
  deaf: 'bg-cyan-500/20 border-cyan-500/40 text-cyan-300',
};

export function DemoMode() {
  const scenarios = getAllScenarios();
  const [selectedId, setSelectedId] = useState<string>(scenarios[0]?.id ?? '');
  const [currentStep, setCurrentStep] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isAutoPlay, setIsAutoPlay] = useState(false);
  const [displayedText, setDisplayedText] = useState('');
  const [glossItems, setGlossItems] = useState<string[]>([]);

  const { pose, isPlaying: avatarPlaying, playSequence, stop } = useAvatarPlayer();
  const autoPlayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scenario: DemoScenario | undefined = getScenario(selectedId);
  const steps = scenario?.steps ?? [];
  const currentStepData: DemoStep | undefined = steps[currentStep];

  const playStep = useCallback(async (step: DemoStep) => {
    setDisplayedText(step.text);
    setGlossItems([]);

    try {
      const glossSeq = await grammarEngine.convert(step.text);
      const chineseWords = glossSeq.items.map((item) => item.chinese);
      setGlossItems(chineseWords);
      if (chineseWords.length > 0) {
        await playSequence(glossSeq);
      }
    } catch {
      // 词汇库中未找到时不阻断演示
    }
  }, [playSequence]);

  const handleStepClick = useCallback((idx: number) => {
    setCurrentStep(idx);
    const step = steps[idx];
    if (step) {
      stop();
      playStep(step);
    }
  }, [steps, stop, playStep]);

  const handlePlayAll = useCallback(() => {
    setIsAutoPlay(true);
    setIsPlaying(true);
    setCurrentStep(0);
    playStep(steps[0]);
  }, [steps, playStep]);

  const handleStop = useCallback(() => {
    setIsAutoPlay(false);
    setIsPlaying(false);
    stop();
    if (autoPlayTimerRef.current) {
      clearTimeout(autoPlayTimerRef.current);
      autoPlayTimerRef.current = null;
    }
  }, [stop]);

  const handleNext = useCallback(() => {
    if (currentStep < steps.length - 1) {
      const next = currentStep + 1;
      setCurrentStep(next);
      playStep(steps[next]);
    } else {
      setIsAutoPlay(false);
      setIsPlaying(false);
    }
  }, [currentStep, steps, playStep]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      const prev = currentStep - 1;
      setCurrentStep(prev);
      playStep(steps[prev]);
    }
  }, [currentStep, steps, playStep]);

  // 自动播放：虚拟人播放结束后自动进入下一步
  useEffect(() => {
    if (!isAutoPlay) return;
    if (!avatarPlaying && isPlaying && displayedText) {
      autoPlayTimerRef.current = setTimeout(() => {
        handleNext();
      }, 1500);
      return () => {
        if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
      };
    }
  }, [isAutoPlay, avatarPlaying, isPlaying, displayedText, handleNext]);

  useEffect(() => {
    return () => {
      stop();
      if (autoPlayTimerRef.current) clearTimeout(autoPlayTimerRef.current);
    };
  }, [stop]);

  const handleScenarioChange = (id: string) => {
    handleStop();
    setSelectedId(id);
    setCurrentStep(0);
    setDisplayedText('');
    setGlossItems([]);
  };

  return (
    <div className="flex flex-col gap-4">
      {/* 场景选择 */}
      <div className="flex flex-wrap gap-2">
        {scenarios.map((s) => (
          <button
            key={s.id}
            onClick={() => handleScenarioChange(s.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
              selectedId === s.id
                ? 'bg-accent-500 text-white shadow-md'
                : 'bg-dark-800 text-content-secondary hover:bg-dark-700 border border-dark-600'
            }`}
          >
            {CATEGORY_LABELS[s.category] ?? s.title}
          </button>
        ))}
      </div>

      {scenario && (
        <>
          {/* 场景信息 */}
          <div className="bg-dark-800 rounded-lg p-4">
            <h3 className="text-lg font-semibold text-content-primary mb-1">
              {CATEGORY_LABELS[scenario.category] ?? scenario.title}
            </h3>
            <p className="text-sm text-content-tertiary">{scenario.description}</p>
          </div>

          <div className="flex flex-col lg:flex-row gap-4">
            {/* 虚拟人演示区 */}
            <div className="flex-1">
              <div className="bg-dark-900 rounded-xl overflow-hidden aspect-video relative">
                <AvatarCanvas pose={pose} width="100%" height="100%" className="!rounded-none" />
                <NonManualMarkerOverlay pose={pose} />
                {!displayedText && (
                  <div className="absolute inset-0 flex items-center justify-center text-content-muted">
                    选择场景并开始演示
                  </div>
                )}
                {displayedText && currentStepData && (
                  <div className={`absolute bottom-3 left-3 right-3 px-4 py-3 rounded-lg border backdrop-blur-md ${SPEAKER_COLORS[currentStepData.speaker]}`}>
                    <div className="text-xs mb-1 opacity-80">{SPEAKER_LABELS[currentStepData.speaker]}</div>
                    <div className="text-lg font-semibold">{displayedText}</div>
                    {glossItems.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {glossItems.map((w, i) => (
                          <span key={i} className="text-xs bg-dark-900/60 px-2 py-0.5 rounded">
                            {w}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* 播放控制 */}
              <div className="flex items-center justify-center gap-3 mt-4">
                <button
                  onClick={() => handlePrev()}
                  disabled={currentStep === 0 || isAutoPlay}
                  className="btn-ghost px-4 py-2 disabled:opacity-30"
                >
                  ← 上一步
                </button>
                {!isPlaying ? (
                  <button onClick={handlePlayAll} className="btn-primary px-6 py-2">
                    ▶ 自动演示
                  </button>
                ) : (
                  <button onClick={handleStop} className="btn-secondary px-6 py-2">
                    ■ 停止
                  </button>
                )}
                <button
                  onClick={() => handleNext()}
                  disabled={currentStep >= steps.length - 1 || isAutoPlay}
                  className="btn-ghost px-4 py-2 disabled:opacity-30"
                >
                  下一步 →
                </button>
              </div>

              <label className="flex items-center justify-center gap-2 mt-2 text-xs text-content-muted cursor-pointer">
                <input
                  type="checkbox"
                  checked={isAutoPlay}
                  onChange={(e) => setIsAutoPlay(e.target.checked)}
                  className="accent-accent-500"
                />
                自动播放（每步间隔 1.5s）
              </label>
            </div>

            {/* 对话脚本 */}
            <div className="lg:w-72 space-y-2 max-h-96 lg:max-h-none overflow-y-auto">
              <div className="text-xs font-semibold text-content-muted px-1 mb-2">
                对话脚本（{steps.length}步）
              </div>
              {steps.map((step, idx) => (
                <button
                  key={idx}
                  onClick={() => handleStepClick(idx)}
                  className={`w-full text-left p-3 rounded-lg border transition-all ${
                    idx === currentStep
                      ? `${SPEAKER_COLORS[step.speaker]} border-current`
                      : 'bg-dark-800 border-dark-700 text-content-secondary hover:border-dark-500'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs opacity-70">{SPEAKER_LABELS[step.speaker]}</span>
                    <span className="text-xs opacity-50">{idx + 1}/{steps.length}</span>
                  </div>
                  <div className="text-sm font-medium">{step.text}</div>
                  {step.note && (
                    <div className="text-xs opacity-60 mt-1">{step.note}</div>
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
