/**
 * @file LearningPage.tsx
 * @description 手语学习页面 —— 顶部标题 + 模式切换标签，根据选中模式渲染词汇查询、跟练模式或 AI 陪练
 *
 * 三种学习模式：
 *   - 词汇查询（search）：搜索浏览词汇，虚拟人演示标准动作
 *   - 跟练模式（practice）：虚拟人演示 → 用户模仿 → 评分反馈
 *   - AI 陪练（tutor）：系统出题 → 用户作答 → 动态调整难度
 */

import { useState } from 'react';
import { WordSearch } from '@/components/learning/WordSearch';
import { PracticeMode } from '@/components/learning/PracticeMode';
import { AITutor } from '@/components/learning/AITutor';
import { DataCollectionPanel } from '@/components/learning/DataCollectionPanel';
import { DemoMode } from '@/components/learning/DemoMode';
import { PageHeader } from '@/components/common/PageHeader';

/** 学习模式 */
type LearningMode = 'search' | 'practice' | 'tutor' | 'collect' | 'demo';

/** 模式标签配置 */
const MODE_TABS: { key: LearningMode; label: string; icon: string; desc: string }[] = [
  { key: 'search', label: '词汇查询', icon: '🔍', desc: '搜索浏览词汇' },
  { key: 'practice', label: '跟练模式', icon: '🎯', desc: '模仿并评分' },
  { key: 'tutor', label: 'AI 陪练', icon: '🤖', desc: '智能出题' },
  { key: 'demo', label: '场景演示', icon: '🎬', desc: '预设场景对话' },
  { key: 'collect', label: '数据采集', icon: '📹', desc: '采集训练数据' },
];

/**
 * 手语学习页面
 * 提供三种学习模式切换：
 * - 词汇查询：搜索浏览词汇，虚拟人演示标准动作
 * - 跟练模式：虚拟人演示 → 用户模仿 → 评分反馈
 * - AI 陪练：系统出题 → 用户作答 → 动态调整难度
 */
export function LearningPage() {
  const [mode, setMode] = useState<LearningMode>('search');

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="手语学习"
        subtitle="查询词汇、跟练动作、AI 陪练，循序渐进"
        icon="📚"
      />

      {/* 模式切换标签 */}
      <div className="card animate-fade-up flex flex-wrap justify-center gap-2 p-2 md:p-3" style={{ animationDelay: '80ms' }}>
        {MODE_TABS.map((tab) => (
          <button
            key={tab.key}
            type="button"
            onClick={() => setMode(tab.key)}
            className={`group flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-all md:flex-none md:px-5 md:py-2.5 ${
              mode === tab.key
                ? 'bg-accent-500 text-white shadow-md'
                : 'border border-dark-600 bg-dark-800 text-content-secondary hover:border-accent-500/40 hover:text-content-primary'
            }`}
          >
            <span className={`text-lg transition-transform group-hover:scale-110`}>
              {tab.icon}
            </span>
            <span>{tab.label}</span>
          </button>
        ))}
      </div>

      {/* 根据模式渲染内容 */}
      <div className="card animate-fade-up p-4 md:p-6" style={{ animationDelay: '160ms' }}>
        {mode === 'search' && <WordSearch />}
        {mode === 'practice' && <PracticeMode />}
        {mode === 'tutor' && <AITutor />}
        {mode === 'demo' && <DemoMode />}
        {mode === 'collect' && <DataCollectionPanel />}
      </div>
    </div>
  );
}

export default LearningPage;
