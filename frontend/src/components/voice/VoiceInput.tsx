import { useCallback, useEffect, useRef, useState } from 'react';
import { useSpeechRecognition } from '@/hooks/useSpeechRecognition';

interface VoiceInputProps {
  /** 识别回调，实时派发中间结果与最终结果 */
  onText: (text: string, isFinal: boolean) => void;
  /** 占位提示文本 */
  placeholder?: string;
}

/**
 * VoiceInput
 * 语音/文字输入组件。
 *
 * 交互设计：
 *   - 主交互：文字输入框（始终可用，回车发送，支持中文输入法 composing 状态）
 *   - 可选交互：按住说话按钮（仅当浏览器支持 Web Speech API 时显示）
 *     按下开始识别、松开结束，按住期间实时显示中间结果。
 *
 * 兼容性说明：Web Speech API 在国内网络环境下多数浏览器不可用，
 * 因此文字输入作为 100% 可用的兜底通道，语音按钮不可用时自动隐藏。
 */
export function VoiceInput({ onText, placeholder = '输入文字，或按住麦克风说话' }: VoiceInputProps) {
  const {
    isListening, transcript, finalText, error, isSupported,
    start, stop, reset,
  } = useSpeechRecognition();

  // 文字输入框状态
  const [text, setText] = useState('');
  // 按住说话状态
  const [isPressed, setIsPressed] = useState(false);

  // 用 ref 持有最新的 onText，避免 effect 频繁重建
  const onTextRef = useRef(onText);
  onTextRef.current = onText;
  // 记录上一次的 finalText，用于计算本次新增的最终文本片段
  const prevFinalRef = useRef(finalText);
  // 同步：当 finalText 被外部 reset 清空时，prevFinalRef 也要同步清空
  useEffect(() => {
    if (finalText === '' && prevFinalRef.current !== '') {
      prevFinalRef.current = '';
    }
  }, [finalText]);

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

  /** 按下麦克风按钮：开始识别 */
  const handlePressStart = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isSupported) return;
    // 每次按下清空上一次的中间/最终结果，开始一段新的识别
    reset();
    prevFinalRef.current = '';
    setIsPressed(true);
    start();
  }, [isSupported, reset, start]);

  /** 松开麦克风按钮：结束识别 */
  const handlePressEnd = useCallback((e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isPressed) return;
    setIsPressed(false);
    stop();
  }, [isPressed, stop]);

  /** 提交文字输入 */
  const submitText = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onTextRef.current(trimmed, true);
    setText('');
  }, [text]);

  /** 错误提示文案（按 Web Speech API 错误码细分） */
  const getErrorMessage = (err: string): string => {
    switch (err) {
      case 'not-supported': return '当前浏览器不支持语音识别';
      case 'not-allowed':
      case 'service-not-allowed': return '麦克风权限被拒绝，请在浏览器设置中允许';
      case 'network': return '网络异常，语音识别服务不可用（国内网络可能无法使用）';
      case 'no-speech': return '没有检测到语音，请按住后说话';
      case 'audio-capture': return '麦克风采集失败，请检查设备';
      case 'aborted': return '';
      default: return err ? `语音识别异常：${err}` : '';
    }
  };
  const errorMsg = error ? getErrorMessage(error) : '';

  // 语音实时识别展示文本（最终 + 中间）
  const voiceDisplay = (finalText + transcript).trim();

  return (
    <div className="flex w-full flex-col gap-3">
      {/* 文字输入区（主交互，始终可用） */}
      <div className="flex w-full items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // 中文输入法 composing 期间回车不提交
            if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) {
              e.preventDefault();
              submitText();
            }
          }}
          placeholder={placeholder}
          className="input flex-1"
          aria-label="文字输入"
        />
        <button
          type="button"
          onClick={submitText}
          disabled={!text.trim()}
          className="btn-primary px-4 py-2.5 disabled:cursor-not-allowed disabled:opacity-40"
          aria-label="发送"
        >
          发送
        </button>
      </div>

      {/* 按住说话按钮（仅浏览器支持 Web Speech API 时显示） */}
      {isSupported && (
        <div className="flex flex-col items-center gap-2">
          <button
            type="button"
            onMouseDown={handlePressStart}
            onMouseUp={handlePressEnd}
            onMouseLeave={handlePressEnd}
            onTouchStart={handlePressStart}
            onTouchEnd={handlePressEnd}
            onTouchCancel={handlePressEnd}
            disabled={!!error && error !== 'no-speech' && error !== 'aborted'}
            aria-label={isPressed ? '松开结束识别' : '按住说话'}
            className={`relative flex h-16 w-16 select-none items-center justify-center rounded-full text-2xl shadow-lg transition-transform active:scale-95 disabled:cursor-not-allowed disabled:opacity-50 ${
              isPressed
                ? 'bg-accent-600 scale-105'
                : 'bg-accent-500 hover:bg-accent-600'
            }`}
          >
            {isListening && (
              <span className="absolute inset-0 animate-ping rounded-full bg-accent-500 opacity-60" />
            )}
            <span className="relative">🎤</span>
          </button>
          <div className="text-xs text-content-tertiary">
            {isPressed ? '松开完成' : '按住说话'}
          </div>
        </div>
      )}

      {/* 语音实时识别结果展示 */}
      {isSupported && (voiceDisplay || isListening) && (
        <div className="min-h-[56px] w-full rounded-lg border border-dark-600/60 bg-dark-800/60 p-3 backdrop-blur">
          {voiceDisplay ? (
            <p className="text-sm text-content-primary">
              <span>{finalText}</span>
              <span className="text-content-secondary">{transcript}</span>
            </p>
          ) : (
            <span className="text-xs text-content-muted">{isListening ? '正在聆听...' : ' '}</span>
          )}
        </div>
      )}

      {/* 错误提示 */}
      {errorMsg && (
        <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-2.5 text-xs text-red-300">
          {errorMsg}
        </div>
      )}

      {/* 不支持语音时的提示 */}
      {!isSupported && (
        <div className="text-center text-xs text-content-muted">
          当前浏览器不支持语音识别，请使用文字输入
        </div>
      )}
    </div>
  );
}
