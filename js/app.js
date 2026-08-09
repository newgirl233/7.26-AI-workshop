/**
 * app.js - 主应用逻辑
 * 管理 UI 状态、事件绑定和对话流程
 */

// ======================== 状态管理 ========================
const state = {
  status: 'idle',        // idle | listening | processing | speaking
  conversation: [],       // [{role: 'user'|'assistant', content: string}]
  isSpeaking: false,
};

// 请求序号：用于判断异步回调是否仍属于当前会话
// （旧请求/旧语音播报的完成回调不能覆盖新请求的状态）
let requestSeq = 0;

// ======================== DOM 引用 ========================
const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => document.querySelectorAll(sel);

const elements = {
  conversation: $('#conversation'),
  messageList: $('#messageList'),
  micBtn: $('#micBtn'),
  statusText: $('#statusText'),
  apiStatus: $('#apiStatus'),
  settingsBtn: $('#settingsBtn'),
  modalOverlay: $('#modalOverlay'),
  settingsForm: $('#settingsForm'),
  testBtn: $('#testBtn'),
  testResult: $('#testResult'),
  textInput: $('#textInput'),
  sendBtn: $('#sendBtn'),
  fontSmallBtn: $('#fontSmallBtn'),
  fontLargeBtn: $('#fontLargeBtn'),
  clearBtn: $('#clearBtn'),
};

// ======================== 工具函数 ========================
function scrollToBottom() {
  const el = elements.conversation;
  requestAnimationFrame(() => {
    el.scrollTop = el.scrollHeight;
  });
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ======================== 渲染函数 ========================

/**
 * 添加一条消息到对话区域
 */
function appendMessage(role, content) {
  const div = document.createElement('div');
  div.className = `message ${role}`;
  div.innerHTML = `<div class="bubble">${escapeHtml(content)}</div>`;
  elements.messageList.appendChild(div);
  scrollToBottom();
}

/**
 * 显示"正在输入"指示器
 */
function showTypingIndicator() {
  const div = document.createElement('div');
  div.className = 'message assistant';
  div.id = 'typingIndicator';
  div.innerHTML = `
    <div class="typing-indicator">
      <div class="typing-dots">
        <span></span><span></span><span></span>
      </div>
    </div>
  `;
  elements.messageList.appendChild(div);
  scrollToBottom();
}

/**
 * 移除"正在输入"指示器
 */
function removeTypingIndicator() {
  const el = document.getElementById('typingIndicator');
  if (el) el.remove();
}

/**
 * 回滚最后一条未完成的用户消息（状态与界面同步移除）
 */
function rollbackLastUserMessage() {
  if (
    state.conversation.length > 0 &&
    state.conversation[state.conversation.length - 1].role === 'user'
  ) {
    state.conversation.pop();
  }
  const userMessages = elements.messageList.querySelectorAll('.message.user');
  const last = userMessages[userMessages.length - 1];
  if (last) last.remove();
  persistConversation();
  scrollToBottom();
}

/**
 * 更新麦克风按钮状态
 */
function updateMicButton(status) {
  const btn = elements.micBtn;
  const text = elements.statusText;

  // 移除所有状态类
  btn.classList.remove('is-listening', 'is-processing', 'is-speaking');
  text.className = 'status-text';

  switch (status) {
    case 'listening':
      btn.classList.add('is-listening');
      btn.setAttribute('aria-label', '正在聆听，点击停止');
      text.textContent = '🎤 正在聆听...请说话';
      text.classList.add('is-listening');
      break;
    case 'processing':
      btn.classList.add('is-processing');
      btn.setAttribute('aria-label', 'AI 正在思考，点击取消请求');
      text.textContent = '⏳ AI 导游正在思考...（点击麦克风可取消）';
      text.classList.add('is-processing');
      break;
    case 'speaking':
      btn.classList.add('is-speaking');
      btn.setAttribute('aria-label', 'AI 正在播报，点击停止');
      text.textContent = '🔊 AI 导游正在播报...';
      text.classList.add('is-speaking');
      break;
    default: // idle
      btn.setAttribute('aria-label', '点击开始语音输入');
      text.textContent = '点击麦克风开始语音对话，或在下方输入文字';
      break;
  }

  state.status = status;
}

/**
 * 更新 API 状态指示
 */
function updateApiStatus() {
  const config = getConfig();
  const el = elements.apiStatus;
  if (config.apiKey && config.apiKey !== 'YOUR_API_KEY_HERE') {
    const masked = config.apiKey.substring(0, 8) + '...';
    el.innerHTML = `<span class="status-dot">●</span> API: ${masked}`;
    el.className = 'api-status configured';
  } else {
    el.innerHTML = '<span class="status-dot">●</span> API 未配置';
    el.className = 'api-status unconfigured';
  }
}

// ======================== 字号调节 ========================

function applyFontSize() {
  const size = Math.min(130, Math.max(90, Prefs.get().fontSize || 100));
  document.documentElement.style.fontSize = `${size}%`;
}

function changeFontSize(delta) {
  const next = Math.min(130, Math.max(90, (Prefs.get().fontSize || 100) + delta));
  Prefs.save({ fontSize: next });
  applyFontSize();
}

// ======================== 声音反馈 ========================

const SoundFeedback = {
  ctx: null,

  play(type) {
    if (!Prefs.get().soundEnabled) return;
    try {
      this.ctx = this.ctx || new (window.AudioContext || window.webkitAudioContext)();
      const ctx = this.ctx;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const config = {
        listening: { freq: 880, dur: 0.08 },
        success: { freq: 1318, dur: 0.12 },
        error: { freq: 220, dur: 0.25 },
      }[type] || { freq: 660, dur: 0.1 };

      osc.type = 'sine';
      osc.frequency.value = config.freq;
      gain.gain.setValueAtTime(0.12, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + config.dur);
      osc.start();
      osc.stop(ctx.currentTime + config.dur);

      if (type === 'listening' && navigator.vibrate) {
        navigator.vibrate(60);
      }
    } catch (e) {
      // 忽略音频错误
    }
  },
};

// ======================== 对话持久化 ========================

/**
 * 重置对话区：清空消息，插入欢迎消息模板
 */
function resetConversation() {
  state.conversation = [];
  elements.messageList.innerHTML = '';
  const template = document.getElementById('welcomeTemplate');
  if (template) elements.messageList.appendChild(template.content.cloneNode(true));
  scrollToBottom();
}

/**
 * 把当前对话保存到 localStorage（仅保留最近 50 条）
 */
function persistConversation() {
  if (!Prefs.get().persistConversation) return;
  try {
    localStorage.setItem('hangzhou_tour_conversation', JSON.stringify(state.conversation.slice(-50)));
  } catch (e) {
    // 忽略保存错误
  }
}

/**
 * 页面加载时恢复上次的对话记录
 */
function renderSavedConversation() {
  resetConversation();
  if (!Prefs.get().persistConversation) return;
  try {
    const saved = JSON.parse(localStorage.getItem('hangzhou_tour_conversation') || '[]');
    if (Array.isArray(saved)) {
      state.conversation = saved.slice(-50);
      state.conversation.forEach((msg) => {
        if (msg && msg.role && msg.content) {
          appendMessage(msg.role, msg.content);
        }
      });
    }
  } catch (e) {
    state.conversation = [];
  }
}

// ======================== 对话流程 ========================

/**
 * 处理用户输入（语音或文字）
 */
async function handleUserInput(text) {
  if (!text) return;

  // 处理中：不允许再发新问题（可用麦克风按钮取消当前请求）
  if (state.status === 'processing') return;

  // AI 正在播报：先打断语音，再处理新问题，避免两个请求/播报重叠
  if (state.status === 'speaking') {
    SpeechManager.cancel();
    state.isSpeaking = false;
  }

  const mySeq = ++requestSeq;

  // 追加用户消息
  state.conversation.push({ role: 'user', content: text });
  appendMessage('user', text);
  persistConversation();

  // 显示输入指示器
  updateMicButton('processing');
  showTypingIndicator();

  try {
    // 调用 AI 导游
    const reply = await askTourGuide(state.conversation);
    if (mySeq !== requestSeq) return; // 已被新输入打断

    // 移除指示器，追加 AI 回复
    removeTypingIndicator();
    state.conversation.push({ role: 'assistant', content: reply });
    appendMessage('assistant', reply);
    persistConversation();
    SoundFeedback.play('success');

    // 语音播报
    updateMicButton('speaking');
    state.isSpeaking = true;
    await SpeechManager.speak(reply);
    if (mySeq !== requestSeq) return; // 播报期间被新输入打断
    state.isSpeaking = false;

    // 回到空闲状态
    updateMicButton('idle');
  } catch (err) {
    removeTypingIndicator();

    // 用户手动取消：回滚未完成的用户消息，回到空闲
    if (err.name === 'AbortError') {
      if (mySeq === requestSeq) {
        rollbackLastUserMessage();
        updateMicButton('idle');
      }
      return;
    }

    if (mySeq !== requestSeq) return; // 旧请求的错误不影响当前会话
    appendMessage('assistant', `[抱歉，出了点问题] ${err.message}`);
    SoundFeedback.play('error');
    updateMicButton('idle');
    console.error('API Error:', err);
  }
}

/**
 * 开始语音识别
 */
function startListening() {
  try {
    SpeechManager.start();
    updateMicButton('listening');
    SoundFeedback.play('listening');
  } catch (err) {
    appendMessage('assistant', `[错误] ${err.message}`);
    SoundFeedback.play('error');
  }
}

/**
 * 停止语音识别
 */
function stopListening() {
  SpeechManager.stop();
  updateMicButton('idle');
}

// ======================== 事件处理 ========================

// 麦克风按钮点击
elements.micBtn.addEventListener('click', () => {
  switch (state.status) {
    case 'idle':
      startListening();
      break;
    case 'listening':
      stopListening();
      break;
    case 'speaking':
      SpeechManager.cancel();
      state.isSpeaking = false;
      updateMicButton('idle');
      break;
    case 'processing':
      // 点击麦克风可取消当前请求
      cancelRequest();
      break;
  }
});

// 文字输入发送
elements.sendBtn.addEventListener('click', () => {
  const text = elements.textInput.value.trim();
  if (text) {
    elements.textInput.value = '';
    handleUserInput(text);
  }
});

elements.textInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    e.preventDefault();
    elements.sendBtn.click();
  }
});

// 快捷提问
elements.messageList.addEventListener('click', (e) => {
  const chip = e.target.closest('.suggestion-chip');
  if (chip) {
    const question = chip.dataset.question;
    if (question) {
      handleUserInput(question);
    }
  }
});

// 字号调节
elements.fontSmallBtn.addEventListener('click', () => changeFontSize(-10));
elements.fontLargeBtn.addEventListener('click', () => changeFontSize(10));

// 清空对话
elements.clearBtn.addEventListener('click', () => {
  resetConversation();
  try {
    localStorage.removeItem('hangzhou_tour_conversation');
  } catch (e) {
    // 忽略清除错误
  }
  elements.statusText.textContent = '对话已清空，可以开始新提问';
});

// ======================== 语音回调绑定 ========================

SpeechManager.onResult = (text) => {
  handleUserInput(text);
};

// 识别过程中的中间结果：实时显示在状态区
SpeechManager.onInterim = (text) => {
  if (state.status === 'listening') {
    elements.statusText.textContent = `🎤 正在聆听：${text}`;
  }
};

SpeechManager.onError = (error) => {
  appendMessage('assistant', `[语音识别错误] ${error}，请尝试在下方输入文字。`);
  SoundFeedback.play('error');
  updateMicButton('idle');
};

SpeechManager.onNoSpeech = () => {
  // 用户点击了麦克风但没有说话，回到空闲状态
  updateMicButton('idle');
};

SpeechManager.onStart = () => {
  updateMicButton('listening');
};

// 预加载语音列表
SpeechManager.loadVoices();

// ======================== 设置面板 ========================

let lastFocusedElement = null;

/**
 * 把系统音色列表填充到"音色"下拉框
 */
function populateVoiceSelect() {
  const select = $('#inputVoice');
  if (!select) return;
  const voices = window.speechSynthesis.getVoices();
  const current = select.value || Prefs.get().voiceURI;
  select.innerHTML = '<option value="">自动（推荐）</option>';
  voices.forEach((v) => {
    const opt = document.createElement('option');
    opt.value = v.voiceURI;
    opt.textContent = `${v.name} (${v.lang})`;
    select.appendChild(opt);
  });
  select.value = voices.some(v => v.voiceURI === current) ? current : '';
}

/**
 * 打开设置弹窗：填入当前配置，记住焦点来源
 */
function openSettings() {
  lastFocusedElement = document.activeElement;

  const config = getConfig();
  $('#inputApiKey').value = config.apiKey === 'YOUR_API_KEY_HERE' ? '' : config.apiKey;
  $('#inputEndpoint').value = config.endpoint;
  $('#inputModel').value = config.model;
  $('#inputProxy').value = config.proxy || '';

  const prefs = Prefs.get();
  $('#inputRate').value = prefs.speechRate;
  $('#inputRateValue').textContent = `${Number(prefs.speechRate).toFixed(1)}x`;
  $('#inputVolume').value = prefs.speechVolume;
  $('#inputVolumeValue').textContent = `${Math.round(Number(prefs.speechVolume) * 100)}%`;
  $('#inputSound').checked = prefs.soundEnabled;
  $('#inputPersist').checked = prefs.persistConversation;
  populateVoiceSelect();

  elements.testResult.style.display = 'none';
  elements.modalOverlay.classList.add('open');
  $('#inputApiKey').focus();
}

/**
 * 关闭设置弹窗：恢复焦点到打开前的元素
 */
function closeSettings() {
  elements.modalOverlay.classList.remove('open');
  if (lastFocusedElement && typeof lastFocusedElement.focus === 'function') {
    lastFocusedElement.focus();
  }
}

// 打开设置
elements.settingsBtn.addEventListener('click', openSettings);

// 关闭设置
$('#closeSettings').addEventListener('click', closeSettings);

elements.modalOverlay.addEventListener('click', (e) => {
  if (e.target === elements.modalOverlay) {
    closeSettings();
  }
});

// 弹窗无障碍：Escape 关闭 + Tab 焦点锁定
document.addEventListener('keydown', (e) => {
  if (!elements.modalOverlay.classList.contains('open')) return;

  if (e.key === 'Escape') {
    e.preventDefault();
    closeSettings();
    return;
  }

  if (e.key === 'Tab') {
    const focusables = [...elements.modalOverlay.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    )].filter((el) => !el.disabled && el.offsetParent !== null);
    if (focusables.length === 0) return;

    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }
});

// 语速/音量滑杆实时显示数值
$('#inputRate').addEventListener('input', () => {
  $('#inputRateValue').textContent = `${Number($('#inputRate').value).toFixed(1)}x`;
});

$('#inputVolume').addEventListener('input', () => {
  $('#inputVolumeValue').textContent = `${Math.round(Number($('#inputVolume').value) * 100)}%`;
});

// 试听当前语音设置
$('#testVoiceBtn').addEventListener('click', () => {
  const rate = Number($('#inputRate').value) || 1;
  const volume = Number($('#inputVolume').value) || 1;
  const voiceURI = $('#inputVoice').value;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance('你好，我是 AI 杭州导游小杭，这是当前语音设置的试听效果。');
  utterance.lang = 'zh-CN';
  utterance.rate = rate;
  utterance.volume = volume;
  const voices = window.speechSynthesis.getVoices();
  const voice = voices.find(v => v.voiceURI === voiceURI) || voices.find(v => v.lang.startsWith('zh'));
  if (voice) utterance.voice = voice;
  window.speechSynthesis.speak(utterance);
});

// 保存设置
elements.settingsForm.addEventListener('submit', (e) => {
  e.preventDefault();
  saveConfig({
    apiKey: $('#inputApiKey').value.trim(),
    endpoint: $('#inputEndpoint').value.trim(),
    model: $('#inputModel').value.trim(),
    proxy: $('#inputProxy').value.trim(),
  });
  Prefs.save({
    speechRate: Number($('#inputRate').value) || 1,
    speechVolume: Number($('#inputVolume').value) || 1,
    voiceURI: $('#inputVoice').value,
    soundEnabled: $('#inputSound').checked,
    persistConversation: $('#inputPersist').checked,
  });
  updateApiStatus();
  closeSettings();
  appendMessage('assistant', '✅ 设置已保存！现在你可以开始提问了。');
});

// 测试连接
elements.testBtn.addEventListener('click', async () => {
  const apiKey = $('#inputApiKey').value.trim();
  if (!apiKey) {
    elements.testResult.className = 'test-result error';
    elements.testResult.textContent = '请先输入 API Key';
    elements.testResult.style.display = 'block';
    return;
  }

  // 临时保存以测试（测试结束后全部还原）
  const origKey = API_CONFIG.apiKey;
  const origEndpoint = API_CONFIG.endpoint;
  const origModel = API_CONFIG.model;
  API_CONFIG.apiKey = apiKey;
  API_CONFIG.endpoint = $('#inputEndpoint').value.trim() || API_CONFIG.endpoint;
  API_CONFIG.model = $('#inputModel').value.trim() || API_CONFIG.model;

  elements.testBtn.disabled = true;
  elements.testBtn.textContent = '测试中...';
  elements.testResult.style.display = 'none';

  try {
    const reply = await testConnection();
    elements.testResult.className = 'test-result success';
    elements.testResult.textContent = `✅ 连接成功！回复：${reply.substring(0, 80)}...`;
    elements.testResult.style.display = 'block';
  } catch (err) {
    elements.testResult.className = 'test-result error';
    elements.testResult.textContent = `❌ 连接失败：${err.message}`;
    elements.testResult.style.display = 'block';
  } finally {
    API_CONFIG.apiKey = origKey;
    API_CONFIG.endpoint = origEndpoint;
    API_CONFIG.model = origModel;
    elements.testBtn.disabled = false;
    elements.testBtn.textContent = '测试连接';
  }
});

// ======================== 初始化 ========================

function init() {
  Prefs.load();
  applyFontSize();
  populateVoiceSelect();
  // Chrome 语音列表异步加载，加载完成后刷新下拉框
  window.speechSynthesis.addEventListener?.('voiceschanged', populateVoiceSelect);

  updateApiStatus();
  updateMicButton('idle');
  renderSavedConversation();
  console.log('AI 杭州导游已启动！🎉');
  console.log('提示：请先点击"设置 API"配置 API Key。');
}

document.addEventListener('DOMContentLoaded', init);
