import { useCallback, useEffect, useRef, useState } from 'react';
import { SpeechRecognizer } from '@/components/voice/SpeechRecognizer';

/** useSpeechRecognition Hook 返回值 */
export interface UseSpeechRecognitionReturn {
  /** 是否正在监听 */
  isListening: boolean;
  /** 当前识别文本（含中间结果） */
  transcript: string;
  /** 最终识别文本（累积） */
  finalText: string;
  /** 错误信息 */
  error: string | null;
  /** 当前浏览器是否支持语音识别 */
  isSupported: boolean;
  /** 开始监听 */
  start: () => void;
  /** 停止监听 */
  stop: () => void;
  /** 重置文本（transcript 与 finalText） */
  reset: () => void;
}

/**
 * useSpeechRecognition
 * 封装 SpeechRecognizer，自动管理识别器生命周期与状态。
 */
export function useSpeechRecognition(): UseSpeechRecognitionReturn {
  // 使用 ref 持有识别器实例，避免重建
  const recognizerRef = useRef<SpeechRecognizer | null>(null);
  const [isListening, setIsListening] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [finalText, setFinalText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSupported, setIsSupported] = useState(false);

  // 初始化识别器，仅创建一次
  if (recognizerRef.current === null) {
    const recognizer = new SpeechRecognizer();
    recognizer.onResult = (text, isFinal) => {
      if (isFinal) {
        // 最终结果：追加到 finalText，清空中间结果
        setFinalText((prev) => (prev ? prev + text : text));
        setTranscript('');
      } else {
        // 中间结果：实时更新 transcript
        setTranscript(text);
      }
    };
    recognizer.onStart = () => {
      setIsListening(true);
      setError(null);
    };
    recognizer.onEnd = () => {
      setIsListening(false);
    };
    recognizer.onError = (err) => {
      setError(err);
      setIsListening(false);
    };
    recognizerRef.current = recognizer;
  }

  // 组件卸载时停止识别并释放资源
  useEffect(() => {
    const recognizer = recognizerRef.current;
    setIsSupported(recognizer?.isSupported() ?? false);
    return () => {
      recognizer?.stop();
    };
  }, []);

  const start = useCallback(() => {
    const recognizer = recognizerRef.current;
    if (!recognizer) return;
    if (!recognizer.isSupported()) {
      setError('not-supported');
      return;
    }
    // 开始前清空上一次错误
    setError(null);
    recognizer.start();
  }, []);

  const stop = useCallback(() => {
    recognizerRef.current?.stop();
  }, []);

  const reset = useCallback(() => {
    setTranscript('');
    setFinalText('');
    setError(null);
  }, []);

  return {
    isListening,
    transcript,
    finalText,
    error,
    isSupported,
    start,
    stop,
    reset,
  };
}
