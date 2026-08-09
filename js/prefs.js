/**
 * prefs.js - 用户偏好设置（字号、语音、反馈等）
 * 与 API 配置分离，独立保存到 localStorage
 */

const DEFAULT_PREFS = {
  fontSize: 100,            // 根字号百分比（90–130）
  speechRate: 1.0,          // 朗读语速
  speechVolume: 1.0,        // 朗读音量
  voiceURI: '',             // 音色，空 = 自动选择中文音色
  soundEnabled: true,       // 操作提示音
  persistConversation: true, // 刷新后保留对话记录
};

const Prefs = {
  data: { ...DEFAULT_PREFS },

  load() {
    try {
      const saved = JSON.parse(localStorage.getItem('hangzhou_tour_prefs') || '{}');
      this.data = { ...DEFAULT_PREFS, ...saved };
    } catch (e) {
      this.data = { ...DEFAULT_PREFS };
    }
    return this.data;
  },

  save(patch) {
    this.data = { ...this.data, ...patch };
    try {
      localStorage.setItem('hangzhou_tour_prefs', JSON.stringify(this.data));
    } catch (e) {
      // 忽略保存错误
    }
    return this.data;
  },

  get() {
    return this.data;
  },
};
