/**
 * speech.js - 语音识别与语音合成模块
 * 使用 Web Speech API 实现
 */

const SpeechManager = {
  recognition: null,
  isListening: false,
  hasResult: false,
  onResult: null,     // callback: (text) => void
  onInterim: null,    // callback: (text) => void  识别过程中的中间结果
  onError: null,      // callback: (error) => void
  onNoSpeech: null,   // callback: () => void  (用户点击后未说话)
  onStart: null,      // callback: () => void

  /**
   * 初始化语音识别
   */
  init() {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      throw new Error('您的浏览器不支持语音识别，请使用 Chrome 浏览器。');
    }

    this.recognition = new SpeechRecognition();
    this.recognition.lang = 'zh-CN';
    this.recognition.continuous = false;
    this.recognition.interimResults = true;
    this.recognition.maxAlternatives = 1;

    this.recognition.onstart = () => {
      this.isListening = true;
      this.hasResult = false;
      this.onStart?.();
    };

    this.recognition.onresult = (e) => {
      let finalText = '';
      let interimText = '';
      for (let i = 0; i < e.results.length; i++) {
        const result = e.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          finalText += transcript;
        } else {
          interimText += transcript;
        }
      }

      if (finalText.trim()) {
        this.hasResult = true;
        this.isListening = false;
        this.onResult?.(finalText.trim());
      } else if (interimText.trim()) {
        this.onInterim?.(interimText.trim());
      }
    };

    this.recognition.onerror = (e) => {
      // 'no-speech' 是用户点击后没有说话的正常情况，不做错误处理
      if (e.error !== 'no-speech') {
        this.onError?.(e.error);
      }
    };

    this.recognition.onend = () => {
      this.isListening = false;
      if (!this.hasResult) {
        this.onNoSpeech?.();
      }
    };
  },

  /**
   * 开始语音识别
   */
  start() {
    if (!this.recognition) this.init();
    try {
      this.recognition.start();
    } catch (e) {
      if (e.name === 'InvalidStateError') {
        // 已经是启动状态，忽略
      } else {
        this.onError?.(e.message);
      }
    }
  },

  /**
   * 停止语音识别
   */
  stop() {
    if (this.recognition) {
      try {
        this.recognition.stop();
      } catch (e) {
        // 忽略停止时的错误
      }
    }
    this.isListening = false;
  },

  /**
   * 语音合成：朗读文本
   * @param {string} text - 要朗读的文本
   * @returns {Promise<void>}
   */
  speak(text) {
    return new Promise((resolve) => {
      // 取消正在进行的朗读
      window.speechSynthesis.cancel();

      const prefs = Prefs.get();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'zh-CN';
      utterance.rate = prefs.speechRate || 1.0;
      utterance.volume = prefs.speechVolume ?? 1.0;

      // 选择用户指定的音色；未指定时自动选择中文语音
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find(v => v.voiceURI === prefs.voiceURI)
                 || voices.find(v => v.lang.startsWith('zh'));
      if (voice) utterance.voice = voice;

      utterance.onend = resolve;
      utterance.onerror = () => resolve(); // 出错也继续
      window.speechSynthesis.speak(utterance);
    });
  },

  /**
   * 停止朗读
   */
  cancel() {
    window.speechSynthesis.cancel();
  },

  /**
   * 预加载语音列表（Chrome 需要异步加载）
   * @returns {Promise<void>}
   */
  loadVoices() {
    return new Promise((resolve) => {
      let voices = window.speechSynthesis.getVoices();
      if (voices.length > 0) {
        resolve();
      } else {
        window.speechSynthesis.onvoiceschanged = () => resolve();
      }
    });
  }
};
