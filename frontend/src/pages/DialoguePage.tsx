// 双向对话页面：左侧健听人（语音→手语），右侧听障人（手语→文字）
// 通过 hooks 间接访问 modules：
//   - useGrammarEngine：语法引擎（中文→手语词汇序列）
//   - useAvatarPipeline：AvatarDriver + 流式播放队列
//   - useRecognizer({ sequence: true })：KeypointExtractor + SequenceClassifier + ConfidenceFilter
import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceInput } from '@/components/voice/VoiceInput';
import { SignCamera } from '@/components/sign/SignCamera';
import AvatarCanvas from '@/components/avatar/AvatarCanvas';
import { useGrammarEngine } from '@/hooks/useGrammarEngine';
import { useAvatarPipeline } from '@/hooks/useAvatarPipeline';
import { useRecognizer } from '@/hooks/useRecognizer';
import type { FrameKeypoints, KeypointSequence, RecognitionStatus } from '@/types/recognition';
import { PageHeader } from '@/components/common/PageHeader';

/** 消息来源 */
type Sender = 'hearing' | 'deaf';
/** 消息类型：voice=语音消息，sign=手语消息 */
type MsgType = 'voice' | 'sign';

/** 对话消息 */
interface Message {
  id: number;
  sender: Sender;
  type: MsgType;
  text: string;        // 文字内容（语音识别结果或手语识别结果）
  confidence?: number; // 识别置信度（手语消息有）
  timestamp: number;
}

/** 历史记录最大条数 */
const MAX_MESSAGES = 50;
/** 帧间隔阈值（毫秒），超过则视为摄像头重启 */
const FRAME_GAP_THRESHOLD = 1000;

/**
 * 双向对话页面
 * 阶段1：本地管道，无需 WebSocket
 * - 健听人侧：语音识别 → 语法引擎 → 虚拟人打手语
 * - 听障人侧：摄像头捕捉 → MediaPipe → 序列分类 → 文字显示
 */
export function DialoguePage() {
  // ===== 对话消息 =====
  const [messages, setMessages] = useState<Message[]>([]);
  const messageIdRef = useRef(0);

  /** 追加一条消息 */
  const appendMessage = useCallback((msg: Omit<Message, 'id' | 'timestamp'>) => {
    const id = messageIdRef.current++;
    setMessages((prev) =>
      [
        ...prev,
        { ...msg, id, timestamp: Date.now() },
      ].slice(-MAX_MESSAGES),
    );
  }, []);

  // ===== 虚拟人（语音→手语）：通过 hooks 间接访问 modules/avatar =====
  const { convert } = useGrammarEngine();
  const {
    pose: currentPose,
    vrmPose: currentVRMPose,
    playOrEnqueue,
    handleVRMLoaded,
  } = useAvatarPipeline();

  /** 处理语音识别文本：转手语词汇序列并入队播放 */
  const handleVoiceText = useCallback(
    (text: string, isFinal: boolean) => {
      if (!isFinal || !text.trim()) return;
      // 立即追加消息
      appendMessage({ sender: 'hearing', type: 'voice', text });
      // 送入语法引擎
      void (async () => {
        try {
          const sequence = await convert(text);
          // 有未匹配词时追加一条系统提示消息
          if (sequence.unmatched_words && sequence.unmatched_words.length > 0) {
            appendMessage({
              sender: 'hearing',
              type: 'voice',
              text: `（未识别：${sequence.unmatched_words.join('、')}）`,
            });
          }
          if (sequence.items.length === 0) return;
          // 流式入队：正在播放则排队，否则立即播放
          playOrEnqueue(sequence);
        } catch {
          // 语法转换错误已在 hook 内部记录，页面静默处理避免打断对话
        }
      })();
    },
    [appendMessage, convert, playOrEnqueue],
  );

  // ===== 手语识别（听障人侧）：通过 useRecognizer 间接访问 modules/recognition =====
  const [signStatus, setSignStatus] = useState<RecognitionStatus>('idle');
  const statusRef = useRef<RecognitionStatus>('idle');
  const lastFrameTimeRef = useRef(0);

  // 序列识别模式：KeypointExtractor + SequenceClassifier + ConfidenceFilter
  const { sequence } = useRecognizer({ singleFrame: false, sequence: true });
  const modelLoading = sequence?.modelLoading ?? false;

  useEffect(() => {
    statusRef.current = signStatus;
  }, [signStatus]);

  const updateStatus = useCallback((s: RecognitionStatus) => {
    statusRef.current = s;
    setSignStatus(s);
  }, []);

  /** 分类关键点序列并追加识别消息 */
  const handleClassify = useCallback(
    async (seq: KeypointSequence | null) => {
      if (!sequence) return;
      if (!seq) {
        updateStatus('waiting');
        return;
      }
      try {
        const result = await sequence.classify(seq);
        const filtered = sequence.filter(result);
        if (filtered.accepted) {
          updateStatus('result');
          appendMessage({
            sender: 'deaf',
            type: 'sign',
            text: result.chinese,
            confidence: result.confidence,
          });
        } else {
          updateStatus('uncertain');
        }
      } catch {
        // 错误已在 hook 内部记录
        updateStatus('uncertain');
      }
    },
    [appendMessage, sequence, updateStatus],
  );

  /** 处理关键点：喂入提取器，检测运动起止，触发分类 */
  const handleKeypoints = useCallback(
    (frame: FrameKeypoints) => {
      if (!sequence) return;
      if (statusRef.current === 'recognizing') return;

      // 摄像头重启检测：帧间隔过大时重置提取器
      const now = Date.now();
      if (lastFrameTimeRef.current > 0 && now - lastFrameTimeRef.current > FRAME_GAP_THRESHOLD) {
        sequence.reset();
      }
      lastFrameTimeRef.current = now;

      if (statusRef.current === 'idle') updateStatus('waiting');
      sequence.feed(frame);

      // 运动结束：提取序列并触发分类
      if (sequence.isMotionEnded()) {
        updateStatus('recognizing');
        const seq = sequence.extract();
        sequence.reset();
        void handleClassify(seq);
        return;
      }
      // 运动开始：切换到 capturing 状态
      if (sequence.isMotionStarted() && statusRef.current !== 'capturing') {
        updateStatus('capturing');
      }
    },
    [handleClassify, sequence, updateStatus],
  );

  return (
    <div className="flex flex-col gap-4 md:gap-6">
      <PageHeader
        title="双向对话"
        subtitle="健听人语音 ↔ 听障人手语，实时双向沟通"
        icon="🔄"
      />

      {/* 对话历史（顶部，全宽）：aria-live="polite" 让屏幕阅读器朗读新消息 */}
      <div className="card animate-fade-up p-4 md:p-5" style={{ animationDelay: '80ms' }}>
        <div className="mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-400" aria-hidden="true" />
          <h3 className="text-sm font-semibold text-content-primary">对话历史</h3>
        </div>
        <div className="max-h-[160px] overflow-y-auto md:max-h-[200px]" aria-live="polite" aria-label="对话历史">
          {messages.length === 0 ? (
            <p className="py-4 text-center text-sm text-content-muted">
              暂无对话记录，开始说话或打手语吧
            </p>
          ) : (
            <ul className="flex flex-col gap-2" aria-label="对话消息列表">
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  className={`flex ${msg.sender === 'hearing' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-2xl px-3 py-2 md:max-w-[70%] md:px-4 ${
                      msg.sender === 'hearing'
                        ? 'border border-accent-500/20 bg-accent-500/10 text-content-primary'
                        : 'border border-cyan-500/20 bg-cyan-500/10 text-cyan-400'
                    }`}
                  >
                    <div className="flex items-center gap-2 text-xs text-content-muted">
                      <span>{msg.sender === 'hearing' ? '健听人' : '听障人'}</span>
                      <span>{msg.type === 'voice' ? '语音' : '手语'}</span>
                      <span>{new Date(msg.timestamp).toLocaleTimeString('zh-CN')}</span>
                      {msg.confidence !== undefined && (
                        <span className="font-medium text-accent-300" aria-label={`置信度 ${Math.round(msg.confidence * 100)}%`}>
                          {Math.round(msg.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm font-medium md:text-base">{msg.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 双面板：左健听人 / 右听障人。使用 role="group" + aria-label 标识两个对话角色面板 */}
      <div className="grid grid-cols-1 gap-4 md:gap-6 lg:grid-cols-2">
        {/* 健听人面板：语音输入 + 虚拟人展示 */}
        <div className="card animate-fade-up flex flex-col gap-3 p-4 md:gap-4 md:p-5" style={{ animationDelay: '160ms' }} role="group" aria-label="健听人面板，语音输入转手语">
          <div className="flex items-center gap-3">
            {/* 装饰性 emoji 图标：aria-hidden 避免屏幕阅读器朗读 */}
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent-500/30 bg-accent-500/15 text-lg" aria-hidden="true">🎤</span>
            <h3 className="font-bold text-content-primary">健听人（语音）</h3>
          </div>
          <VoiceInput onText={handleVoiceText} placeholder="点击麦克风说话，将转为手语" />
          <div className="flex items-start justify-center">
            <div className="aspect-[6/7] w-full max-w-[360px]">
              <AvatarCanvas pose={currentPose} vrmPose={currentVRMPose} width="100%" height="100%" onVRMLoaded={handleVRMLoaded} />
            </div>
          </div>
        </div>

        {/* 听障人面板：摄像头 + 识别结果 */}
        <div className="card animate-fade-up flex flex-col gap-3 p-4 md:gap-4 md:p-5" style={{ animationDelay: '240ms' }} role="group" aria-label="听障人面板，手语识别转文字">
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/15 text-lg" aria-hidden="true">👋</span>
            <h3 className="font-bold text-content-primary">听障人（手语）</h3>
          </div>
          {modelLoading ? (
            <div className="flex h-[200px] items-center justify-center text-content-muted" role="status" aria-live="polite">
              模型加载中...
            </div>
          ) : (
            <>
              <div className="aspect-[4/3] w-full">
                <SignCamera
                  onKeypoints={handleKeypoints}
                  showLandmarks
                  width="100%"
                  height="100%"
                />
              </div>
              {/* 手语识别状态：role="status" 让屏幕阅读器朗读状态变化 */}
              <div className="rounded-lg border border-dark-600 bg-dark-900/40 p-3 text-center" role="status" aria-live="polite">
                <span className="text-xs md:text-sm text-content-secondary">
                  状态：{signStatus === 'idle' ? '等待启动' :
                    signStatus === 'waiting' ? '等待手部运动' :
                    signStatus === 'capturing' ? '捕捉中...' :
                    signStatus === 'recognizing' ? '识别中...' :
                    signStatus === 'result' ? '识别完成' :
                    '请重新打手语'}
                </span>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
