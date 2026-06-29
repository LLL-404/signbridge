// Web Speech API 类型声明（浏览器内置，TS 默认未包含）
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

interface SpeechRecognitionResult {
  readonly length: number;
  isFinal: boolean;
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  readonly length: number;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}

interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start(): void;
  stop(): void;
  abort(): void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onend: (() => void) | null;
  onstart: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: { new (): SpeechRecognition };
    webkitSpeechRecognition: { new (): SpeechRecognition };
  }
}

/** SpeechRecognizer 配置项 */
export interface SpeechRecognizerOptions {
  /** 识别语言，BCP-47 标签，默认中文 */
  lang?: string;
  /** 是否持续识别（直到手动停止），默认 true */
  continuous?: boolean;
  /** 是否返回中间结果，默认 true */
  interimResults?: boolean;
}

/** 识别结果回调 */
export type SpeechResultHandler = (text: string, isFinal: boolean) => void;
/** 错误回调 */
export type SpeechErrorHandler = (error: string) => void;

/**
 * SpeechRecognizer
 * 封装 Web Speech API 的 SpeechRecognition 接口，
 * 自动处理浏览器前缀（webkitSpeechRecognition）。
 */
export class SpeechRecognizer {
  private recognition: SpeechRecognition | null = null;
  private lang: string;
  private continuous: boolean;
  private interimResults: boolean;

  // 事件回调（外部赋值）
  public onResult: SpeechResultHandler | null = null;
  public onError: SpeechErrorHandler | null = null;
  public onStart: (() => void) | null = null;
  public onEnd: (() => void) | null = null;

  constructor(options: SpeechRecognizerOptions = {}) {
    this.lang = options.lang ?? 'zh-CN';
    this.continuous = options.continuous ?? true;
    this.interimResults = options.interimResults ?? true;
    this.initRecognition();
  }

  /** 初始化底层 SpeechRecognition 实例 */
  private initRecognition(): void {
    const Ctor = this.getRecognitionCtor();
    if (!Ctor) {
      // 浏览器不支持时保持 recognition 为 null，由 isSupported 兜底
      return;
    }
    const recognition = new Ctor();
    recognition.lang = this.lang;
    recognition.continuous = this.continuous;
    recognition.interimResults = this.interimResults;
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      this.onStart?.();
    };
    recognition.onend = () => {
      this.onEnd?.();
    };
    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      this.onError?.(event.error || 'unknown');
    };
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      this.handleResult(event);
    };

    this.recognition = recognition;
  }

  /** 处理识别结果，区分中间结果与最终结果 */
  private handleResult(event: SpeechRecognitionEvent): void {
    const results = event.results;
    const resultIndex = event.resultIndex;
    let interimText = '';
    let finalText = '';

    // 从 resultIndex 开始遍历新增的结果
    for (let i = resultIndex; i < results.length; i++) {
      const result = results[i];
      const transcript = result[0]?.transcript ?? '';
      if (result.isFinal) {
        finalText += transcript;
      } else {
        interimText += transcript;
      }
    }

    // 优先派发最终结果，再派发中间结果
    if (finalText) {
      this.onResult?.(finalText, true);
    }
    if (interimText) {
      this.onResult?.(interimText, false);
    }
  }

  /** 获取浏览器支持的 SpeechRecognition 构造函数 */
  private getRecognitionCtor(): { new (): SpeechRecognition } | null {
    if (typeof window === 'undefined') return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  /** 检查浏览器是否支持语音识别 */
  public isSupported(): boolean {
    return this.getRecognitionCtor() !== null;
  }

  /** 开始识别 */
  public start(): void {
    if (!this.recognition) {
      this.onError?.('not-supported');
      return;
    }
    try {
      this.recognition.start();
    } catch (err) {
      // 重复 start 会抛 InvalidStateError，吞掉避免中断流程
      const message = err instanceof Error ? err.message : 'start-failed';
      this.onError?.(message);
    }
  }

  /** 停止识别（会触发 onend） */
  public stop(): void {
    if (!this.recognition) return;
    try {
      this.recognition.stop();
    } catch {
      // 忽略未在识别状态下 stop 的异常
    }
  }

  /** 中止识别（不触发完整结束流程） */
  public abort(): void {
    if (!this.recognition) return;
    try {
      this.recognition.abort();
    } catch {
      // 忽略异常
    }
  }
}
