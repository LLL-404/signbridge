// 语法引擎 Hook
// 封装 GrammarEngine 单例的调用，提供文本到手语词汇序列的转换能力
// 让页面通过 hook 间接访问 modules/grammar，避免直接 import
// 错误在 hook 内部记录后重新抛出，让调用方决定 UI 处理方式
import { useCallback } from 'react';
import { grammarEngine } from '@/modules/grammar/GrammarEngine';
import type { GlossSequence } from '@/types/grammar';
import { logger } from '@/modules/debug/logger';

const log = logger.module('useGrammarEngine');

/** useGrammarEngine 返回值 */
export interface UseGrammarEngineReturn {
  /**
   * 将中文文本转换为中国手语词汇序列
   * 内部完成分词、重写、词汇映射、非手动标记四个阶段
   * 错误在 hook 内部记录后重新抛出，调用方需自行 try-catch
   */
  convert: (text: string) => Promise<GlossSequence>;
}

/**
 * 语法引擎 Hook
 * - 复用全局 grammarEngine 单例（避免重复初始化 Tokenizer / Rewriter 等内部模块）
 * - 通过 useCallback 稳定 convert 引用，便于下游 useEffect 依赖
 */
export function useGrammarEngine(): UseGrammarEngineReturn {
  const convert = useCallback(async (text: string): Promise<GlossSequence> => {
    try {
      return await grammarEngine.convert(text);
    } catch (err) {
      log.error('语法转换失败', err);
      throw err;
    }
  }, []);

  return { convert };
}
