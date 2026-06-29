// 应用全局状态管理（Zustand）
// 维护词汇数据加载状态等全局标志

import { create } from 'zustand';

/** 应用全局状态接口 */
export interface AppStore {
  /** 词汇数据是否已加载完成 */
  isVocabularyLoaded: boolean;
  /** 设置词汇加载状态 */
  setVocabularyLoaded: (loaded: boolean) => void;
}

/** 应用全局状态 store */
export const useAppStore = create<AppStore>((set) => ({
  isVocabularyLoaded: false,
  setVocabularyLoaded: (loaded) => set({ isVocabularyLoaded: loaded }),
}));
