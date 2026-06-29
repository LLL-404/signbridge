// 双向对话页面：左侧健听人（语音→手语），右侧听障人（手语→文字）
import { useCallback, useEffect, useRef, useState } from 'react';
import { VoiceInput } from '@/components/voice/VoiceInput';
import { SignCamera } from '@/components/sign/SignCamera';
import AvatarCanvas from '@/components/avatar/AvatarCanvas';
import { grammarEngine } from '@/modules/grammar/GrammarEngine';
import { AvatarDriver } from '@/modules/avatar/AvatarDriver';
import { KeypointExtractor } from '@/modules/recognition/KeypointExtractor';
import { SequenceClassifier } from '@/modules/recognition/SequenceClassifier';
import { ConfidenceFilter } from '@/modules/recognition/ConfidenceFilter';
import { NEUTRAL_POSE } from '@/types/avatar';
import type { BonePose } from '@/types/avatar';
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

  // ===== 虚拟人（语音→手语）=====
  const [currentPose, setCurrentPose] = useState<BonePose>(NEUTRAL_POSE);
  const avatarDriverRef = useRef<AvatarDriver | null>(null);
  if (avatarDriverRef.current === null) {
    avatarDriverRef.current = new AvatarDriver();
  }
  const queueRef = useRef<Parameters<AvatarDriver['playSequence']>[0][]>([]);
  const isPlayingRef = useRef(false);
  const rafRef = useRef<number>(0);
  const lastTimeRef = useRef(0);
  const lastPoseRef = useRef<BonePose>(NEUTRAL_POSE);
  const playNextRef = useRef<(seq: Parameters<AvatarDriver['playSequence']>[0]) => void>(() => {});

  // 播放下一个序列
  playNextRef.current = (sequence) => {
    const driver = avatarDriverRef.current;
    if (!driver) return;
    isPlayingRef.current = true;
    void driver.playSequence(sequence, () => {
      const next = queueRef.current.shift();
      if (next) {
        playNextRef.current(next);
      } else {
        isPlayingRef.current = false;
      }
    });
  };

  // 处理语音识别文本
  const handleVoiceText = useCallback(
    (text: string, isFinal: boolean) => {
      if (!isFinal || !text.trim()) return;
      // 立即追加消息
      appendMessage({ sender: 'hearing', type: 'voice', text });
      // 送入语法引擎
      void (async () => {
        try {
          const sequence = await grammarEngine.convert(text);
          if (isPlayingRef.current) {
            queueRef.current.push(sequence);
          } else {
            playNextRef.current(sequence);
          }
        } catch (err) {
          console.error('语法转换失败:', err);
        }
      })();
    },
    [appendMessage],
  );

  // 动画循环
  useEffect(() => {
    const tick = (timestamp: number) => {
      const driver = avatarDriverRef.current;
      if (driver) {
        const delta = lastTimeRef.current === 0 ? 0 : timestamp - lastTimeRef.current;
        lastTimeRef.current = timestamp;
        driver.update(delta);
        const pose = driver.getCurrentPose();
        if (pose !== lastPoseRef.current) {
          lastPoseRef.current = pose;
          setCurrentPose(pose);
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafRef.current);
      avatarDriverRef.current?.stop();
      queueRef.current = [];
      isPlayingRef.current = false;
    };
  }, []);

  // ===== 手语识别（听障人侧）=====
  const [signStatus, setSignStatus] = useState<RecognitionStatus>('idle');
  const [modelLoading, setModelLoading] = useState(true);
  const extractorRef = useRef<KeypointExtractor | null>(null);
  const classifierRef = useRef<SequenceClassifier | null>(null);
  const filterRef = useRef<ConfidenceFilter | null>(null);
  const statusRef = useRef<RecognitionStatus>('idle');
  const lastFrameTimeRef = useRef(0);

  useEffect(() => {
    statusRef.current = signStatus;
  }, [signStatus]);

  // 初始化识别模型
  useEffect(() => {
    extractorRef.current = new KeypointExtractor();
    classifierRef.current = new SequenceClassifier();
    filterRef.current = new ConfidenceFilter();
    let cancelled = false;
    classifierRef.current
      .init()
      .then(() => { if (!cancelled) setModelLoading(false); })
      .catch((err) => {
        if (!cancelled) {
          console.error('模型加载失败:', err);
          setModelLoading(false);
        }
      });
    return () => {
      cancelled = true;
      classifierRef.current?.dispose();
    };
  }, []);

  const updateStatus = useCallback((s: RecognitionStatus) => {
    statusRef.current = s;
    setSignStatus(s);
  }, []);

  const handleClassify = useCallback(
    async (sequence: KeypointSequence | null) => {
      const classifier = classifierRef.current;
      const filter = filterRef.current;
      if (!classifier || !filter) return;
      if (!sequence) {
        updateStatus('waiting');
        return;
      }
      try {
        const result = await classifier.classify(sequence);
        const filtered = filter.filter(result);
        if (filtered.accepted) {
          updateStatus('result');
          // 追加手语识别消息
          appendMessage({
            sender: 'deaf',
            type: 'sign',
            text: result.chinese,
            confidence: result.confidence,
          });
        } else {
          updateStatus('uncertain');
        }
      } catch (err) {
        console.error('识别失败:', err);
        updateStatus('uncertain');
      }
    },
    [appendMessage, updateStatus],
  );

  const handleKeypoints = useCallback(
    (frame: FrameKeypoints) => {
      const extractor = extractorRef.current;
      if (!extractor) return;
      if (statusRef.current === 'recognizing') return;

      const now = Date.now();
      if (lastFrameTimeRef.current > 0 && now - lastFrameTimeRef.current > FRAME_GAP_THRESHOLD) {
        extractor.reset();
      }
      lastFrameTimeRef.current = now;

      if (statusRef.current === 'idle') updateStatus('waiting');
      extractor.feed(frame);

      if (extractor.isMotionEnded()) {
        updateStatus('recognizing');
        const seq = extractor.extract();
        extractor.reset();
        void handleClassify(seq);
        return;
      }
      if (extractor.isMotionStarted()) {
        if (statusRef.current !== 'capturing') updateStatus('capturing');
      }
    },
    [handleClassify, updateStatus],
  );

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        title="双向对话"
        subtitle="健听人语音 ↔ 听障人手语，实时双向沟通"
        icon="🔄"
      />

      {/* 对话历史（顶部，全宽） */}
      <div className="card animate-fade-up p-5" style={{ animationDelay: '80ms' }}>
        <div className="mb-3 flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-accent-400" />
          <h3 className="text-sm font-semibold text-content-primary">对话历史</h3>
        </div>
        <div className="max-h-[200px] overflow-y-auto">
          {messages.length === 0 ? (
            <p className="py-4 text-center text-sm text-content-muted">
              暂无对话记录，开始说话或打手语吧
            </p>
          ) : (
            <ul className="flex flex-col gap-2">
              {messages.map((msg) => (
                <li
                  key={msg.id}
                  className={`flex ${msg.sender === 'hearing' ? 'justify-start' : 'justify-end'}`}
                >
                  <div
                    className={`max-w-[70%] rounded-2xl px-4 py-2 ${
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
                        <span className="font-medium text-accent-300">
                          {Math.round(msg.confidence * 100)}%
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-base font-medium">{msg.text}</p>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* 双面板：左健听人 / 右听障人 */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* 健听人面板：语音输入 + 虚拟人展示 */}
        <div className="card animate-fade-up flex flex-col gap-4 p-5" style={{ animationDelay: '160ms' }}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-accent-500/30 bg-accent-500/15 text-lg">🎤</span>
            <h3 className="font-bold text-content-primary">健听人（语音）</h3>
          </div>
          <VoiceInput onText={handleVoiceText} placeholder="点击麦克风说话，将转为手语" />
          <div className="flex items-start justify-center">
            <AvatarCanvas pose={currentPose} width={360} height={420} />
          </div>
        </div>

        {/* 听障人面板：摄像头 + 识别结果 */}
        <div className="card animate-fade-up flex flex-col gap-4 p-5" style={{ animationDelay: '240ms' }}>
          <div className="flex items-center gap-3">
            <span className="flex h-9 w-9 items-center justify-center rounded-full border border-cyan-500/30 bg-cyan-500/15 text-lg">👋</span>
            <h3 className="font-bold text-content-primary">听障人（手语）</h3>
          </div>
          {modelLoading ? (
            <div className="flex h-[200px] items-center justify-center text-content-muted">
              模型加载中...
            </div>
          ) : (
            <>
              <SignCamera
                onKeypoints={handleKeypoints}
                showLandmarks
                width={360}
                height={270}
              />
              <div className="rounded-lg border border-dark-600 bg-dark-900/40 p-3 text-center">
                <span className="text-sm text-content-secondary">
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
