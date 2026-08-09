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
  welcomeSuggestions: $('#welcomeSuggestions'),
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
  } catch (err) {
    appendMessage('assistant', `[错误] ${err.message}`);
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
elements.welcomeSuggestions.addEventListener('click', (e) => {
  const chip = e.target.closest('.suggestion-chip');
  if (chip) {
    const question = chip.dataset.question;
    if (question) {
      handleUserInput(question);
    }
  }
});

// ======================== 语音回调绑定 ========================

SpeechManager.onResult = (text) => {
  handleUserInput(text);
};

SpeechManager.onError = (error) => {
  appendMessage('assistant', `[语音识别错误] ${error}，请尝试在下方输入文字。`);
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

// 打开设置
elements.settingsBtn.addEventListener('click', () => {
  const config = getConfig();
  $('#inputApiKey').value = config.apiKey === 'YOUR_API_KEY_HERE' ? '' : config.apiKey;
  $('#inputEndpoint').value = config.endpoint;
  $('#inputModel').value = config.model;
  $('#inputProxy').value = config.proxy || '';
  elements.testResult.style.display = 'none';
  elements.modalOverlay.classList.add('open');
});

// 关闭设置
$('#closeSettings').addEventListener('click', () => {
  elements.modalOverlay.classList.remove('open');
});

elements.modalOverlay.addEventListener('click', (e) => {
  if (e.target === elements.modalOverlay) {
    elements.modalOverlay.classList.remove('open');
  }
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
  updateApiStatus();
  elements.modalOverlay.classList.remove('open');
  appendMessage('assistant', '✅ API 配置已保存！现在你可以开始提问了。');
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
  updateApiStatus();
  updateMicButton('idle');
  console.log('AI 杭州导游已启动！🎉');
  console.log('提示：请先点击"设置 API"配置 API Key。');
}

document.addEventListener('DOMContentLoaded', init);
