// 词汇查询组件
// 提供搜索框、分类标签、词汇卡片网格，点击词汇后由虚拟人演示标准动作
import { useCallback, useEffect, useMemo, useState } from 'react';
import AvatarCanvas from '@/components/avatar/AvatarCanvas';
import { useAvatarPlayer } from '@/hooks/useAvatarPlayer';
import { vocabularyStore } from '@/modules/data/VocabularyStore';
import type { SignGloss } from '@/types/sign';

/** WordSearch 组件 Props */
export interface WordSearchProps {
  /** 选中词汇回调 */
  onSelectWord?: (gloss: SignGloss) => void;
}

/** 预设分类列表 */
const CATEGORIES = [
  '全部',
  '日常问候',
  '就医',
  '办事',
  '交通',
  '人物',
  '基础动词',
  '基础名词',
] as const;

/** 根据难度返回星级文本 */
function getDifficultyStars(difficulty: number): string {
  return '★'.repeat(difficulty) + '☆'.repeat(3 - difficulty);
}

/**
 * 词汇查询模式
 * - 搜索框支持中文模糊搜索
 * - 分类标签筛选词汇
 * - 词汇卡片网格展示中文词、分类、难度星级
 * - 点击卡片由虚拟人演示该词汇的标准动作
 */
export function WordSearch({ onSelectWord }: WordSearchProps) {
  const [allWords, setAllWords] = useState<SignGloss[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState<string>('全部');
  const [selectedGloss, setSelectedGloss] = useState<SignGloss | null>(null);
  const [loading, setLoading] = useState(true);

  const { pose, isPlaying, playGloss } = useAvatarPlayer();

  // 初始化加载全部词汇
  useEffect(() => {
    vocabularyStore.getAll().then((words) => {
      setAllWords(words);
      setLoading(false);
    });
  }, []);

  /** 根据搜索词和分类筛选词汇 */
  const filteredWords = useMemo(() => {
    let result = allWords;
    // 分类筛选
    if (activeCategory !== '全部') {
      result = result.filter((w) => w.category === activeCategory);
    }
    // 搜索词筛选
    const query = searchQuery.trim();
    if (query) {
      const lower = query.toLowerCase();
      result = result.filter(
        (w) =>
          w.chinese.toLowerCase().includes(lower) ||
          (w.english?.toLowerCase().includes(lower) ?? false),
      );
    }
    return result;
  }, [allWords, activeCategory, searchQuery]);

  /** 点击词汇卡片：选中并播放动作 */
  const handleSelectWord = useCallback(
    (gloss: SignGloss) => {
      setSelectedGloss(gloss);
      onSelectWord?.(gloss);
      playGloss(gloss.gloss_id);
    },
    [onSelectWord, playGloss],
  );

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_400px]">
      {/* 左侧：搜索与词汇列表 */}
      <div className="space-y-4">
        {/* 搜索框 */}
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="输入中文词搜索..."
          className="w-full rounded-lg border border-gray-300 px-4 py-2 text-gray-800 shadow-sm focus:border-brand-start focus:outline-none focus:ring-2 focus:ring-brand-start/30"
        />

        {/* 分类标签 */}
        <div className="flex flex-wrap gap-2">
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveCategory(cat)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                activeCategory === cat
                  ? 'bg-gradient-to-r from-brand-start to-brand-end text-white'
                  : 'bg-white/80 text-gray-600 hover:bg-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* 词汇卡片网格 */}
        {loading ? (
          <div className="py-8 text-center text-gray-500">加载中...</div>
        ) : filteredWords.length === 0 ? (
          <div className="py-8 text-center text-gray-500">未找到匹配的词汇</div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {filteredWords.map((gloss) => (
              <button
                key={gloss.gloss_id}
                type="button"
                onClick={() => handleSelectWord(gloss)}
                className={`rounded-xl border p-3 text-left transition-all hover:shadow-md ${
                  selectedGloss?.gloss_id === gloss.gloss_id
                    ? 'border-brand-start bg-brand-start/10'
                    : 'border-gray-200 bg-white/80'
                }`}
              >
                <div className="mb-1 text-lg font-semibold text-gray-800">{gloss.chinese}</div>
                <div className="mb-1 text-xs text-gray-500">{gloss.category}</div>
                <div className="text-xs text-yellow-500">{getDifficultyStars(gloss.difficulty)}</div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* 右侧：虚拟人演示 */}
      <div className="flex flex-col items-center gap-3">
        <div className="text-sm font-medium text-gray-600">
          {selectedGloss ? `演示：${selectedGloss.chinese}` : '请选择词汇查看演示'}
        </div>
        <AvatarCanvas pose={pose} width={400} height={500} />
        {isPlaying && (
          <div className="text-sm text-brand-start">▶ 正在播放动作...</div>
        )}
        {selectedGloss && !isPlaying && (
          <button
            type="button"
            onClick={() => playGloss(selectedGloss.gloss_id)}
            className="rounded-lg bg-gradient-to-r from-brand-start to-brand-end px-6 py-2 font-medium text-white transition-transform hover:scale-105"
          >
            重新播放
          </button>
        )}
      </div>
    </div>
  );
}
