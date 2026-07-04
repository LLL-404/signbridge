import { useCallback, useState } from 'react';

interface VoiceInputProps {
  onText: (text: string, isFinal: boolean) => void;
  placeholder?: string;
}

/**
 * VoiceInput
 * 纯文字输入组件（语音输入已移除，因 Web Speech API 依赖 Google 服务器、国内不可用，
 * 离线模型 269MB 超出 GitHub Pages 单文件 100MB 限制，不可分发）。
 *
 * 交互：输入框 + 发送按钮，回车提交，兼容中文输入法 composing 状态。
 */
export function VoiceInput({ onText, placeholder = '输入文字' }: VoiceInputProps) {
  const [text, setText] = useState('');

  const submitText = useCallback(() => {
    const trimmed = text.trim();
    if (!trimmed) return;
    onText(trimmed, true);
    setText('');
  }, [text, onText]);

  return (
    <div className="flex w-full items-center gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' && !(e.nativeEvent as KeyboardEvent).isComposing) {
            e.preventDefault();
            submitText();
          }
        }}
        placeholder={placeholder}
        className="input flex-1"
        aria-label="文字输入"
        autoFocus
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
  );
}
