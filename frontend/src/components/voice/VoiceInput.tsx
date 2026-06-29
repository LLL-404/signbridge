import { useEffect, useRef } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

interface VoiceInputProps {
  /** 识别回调，实时派发中间结果与最终结果 */
  onText: (text: string, isFinal: boolean) => void;
  /** 占位提示文本 */
  placeholder?: string;
}

/**
 * VoiceInput
 * 语音输入组件：麦克风按钮 + 实时文本展示 + 状态提示。
 */
export function VoiceInput({ onText, placeholder = '点击麦克风开始说话' }: VoiceInputProps) {
  const {
    isListening,
    transcript,
    finalText,
    error,
    isSupported,
    start,
    stop,
    reset,
  } = useSpeechRecognition();

  // 用 ref 持有最新的 onText，避免 effect 频繁重建
  const onTextRef = useRef(onText);
  onTextRef.current = onText;

  // 记录上一次的 finalText，用于计算本次新增的最终文本片段
  const prevFinalRef = useRef(finalText);

  // 中间结果实时回调
  useEffect(() => {
    if (transcript) {
      onTextRef.current(transcript, false);
    }
  }, [transcript]);

  // 最终结果回调（仅派发增量部分）
  useEffect(() => {
    if (finalText !== prevFinalRef.current) {
      const diff = finalText.slice(prevFinalRef.current.length);
      prevFinalRef.current = finalText;
      if (diff) {
        onTextRef.current(diff, true);
      }
    }
  }, [finalText]);

  /** 切换监听状态 */
  const toggle = () => {
    if (isListening) {
      stop();
    } else {
      start();
    }
  };

  // 状态提示文本（按优先级：不支持 > 出错 > 监听中 > 默认）
  const statusText = !isSupported
    ? '不支持语音识别'
    : error
      ? '识别出错'
      : isListening
        ? '正在聆听...'
        : '点击说话';

  // 展示文本：最终文本 + 中间结果，无内容时显示占位符
  const displayText = (finalText + transcript).trim();
  const isEmpty = !displayText;

  return (
    <div className="flex w-full flex-col items-center gap-4">
      {/* 麦克风按钮（带脉冲动画） */}
      <div className="relative flex h-16 w-16 items-center justify-center">
        {isListening && (
          <span className="absolute inset-0 animate-ping rounded-full bg-brand-start opacity-60" />
        )}
        <button
          type="button"
          onClick={toggle}
          disabled={!isSupported}
          aria-label={isListening ? '停止语音输入' : '开始语音输入'}
          className="relative flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-r from-brand-start to-brand-end text-2xl text-white shadow-lg transition-transform hover:scale-105 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:scale-100"
        >
          🎤
        </button>
      </div>

      {/* 状态提示 */}
      <div
        className={`text-sm ${
          error || !isSupported ? 'text-red-500' : 'text-gray-600'
        }`}
      >
        {statusText}
      </div>

      {/* 实时文字显示区域 */}
      <div className="min-h-[80px] w-full rounded-lg bg-white/60 p-4 backdrop-blur">
        {isEmpty ? (
          <span className="text-gray-400">{placeholder}</span>
        ) : (
          <p className="text-gray-800">
            {finalText}
            <span className="text-gray-500">{transcript}</span>
          </p>
        )}
      </div>

      {/* 清空按钮 */}
      {(transcript || finalText) && (
        <button
          type="button"
          onClick={reset}
          className="text-xs text-gray-500 underline hover:text-gray-700"
        >
          清空
        </button>
      )}
    </div>
  );
}
