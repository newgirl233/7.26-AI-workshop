/**
 * api.js - LLM API 调用模块
 * 使用 OpenAI 兼容接口，可对接多种大语言模型
 *
 * ============================================
 *  >>>  使用前请填入你的 API Key  <<<
 *  方式一：直接在下面 API_CONFIG 中填写
 *  方式二：在网页中点击"设置 API"按钮填写（会保存到浏览器本地）
 * ============================================
 */

const API_CONFIG = {
  // >>>>>>>>>> 在这里填入你的 API Key <<<<<<<<<<
  apiKey: 'YOUR_API_KEY_HERE',
  // >>>>>>>>>> 如需修改 API 端点 <<<<<<<<<<
  // 注意：这里填的是完整的请求 URL！！
  // DeepSeek (新版): https://api.deepseek.com/chat/completions
  // DeepSeek (旧版): https://api.deepseek.com/v1/chat/completions  
  // OpenAI:          https://api.openai.com/v1/chat/completions
  // Moonshot:        https://api.moonshot.cn/v1/chat/completions
  // SiliconFlow:     https://api.siliconflow.cn/v1/chat/completions
  endpoint: 'https://api.deepseek.com',
  // >>>>>>>>>> 模型名称 <<<<<<<<<<
  // DeepSeek 用 deepseek-v4-flash 或 deepseek-chat
  model: 'deepseek-v4-flash',
  // >>>>>>>>>> 本地代理地址（可选） <<<<<<<<<<
  // 留空则直连 API；若浏览器报 CORS 错误，可运行 server.py 后填写：
  // http://localhost:8080/api/chat
  proxy: '',
};

/**
 * AI 导游系统提示词
 * 定义导游的角色、语言风格和回答要求
 */
const SYSTEM_PROMPT = `你是一位专业、热情的杭州导游，名叫"小杭"。你正在通过语音对话为视障朋友介绍杭州的美景、文化和美食。

## 回答要求
1. 语言自然口语化，适合语音合成朗读，不要使用 Markdown 格式
2. 善用感官描述（声音、气味、温度、触感、微风等），帮助视障朋友"感受"景色
3. 描述生动形象，让人如同身临其境
4. 可以适当融入历史故事和文化典故
5. 提供实用信息（最佳游览时间、交通方式等）
6. 回答长度适中（200-400 字），不要太长
7. 语气亲切友好，像一位真正热情的导游在解说
8. 如果用户用英文提问，请用中文回答`;

/**
 * 加载配置（优先从 localStorage 读取）
 */
function loadConfig() {
  try {
    const saved = localStorage.getItem('hangzhou_tour_config');
    if (saved) {
      const parsed = JSON.parse(saved);
      API_CONFIG.apiKey = parsed.apiKey || API_CONFIG.apiKey;
      API_CONFIG.endpoint = parsed.endpoint || API_CONFIG.endpoint;
      API_CONFIG.model = parsed.model || API_CONFIG.model;
      API_CONFIG.proxy = parsed.proxy !== undefined ? parsed.proxy : API_CONFIG.proxy;
    }
  } catch (e) {
    // 忽略读取错误
  }
}

/**
 * 保存配置到 localStorage
 * @param {Object} config - { apiKey, endpoint, model }
 */
function saveConfig(config) {
  if (config.apiKey !== undefined) API_CONFIG.apiKey = config.apiKey;
  if (config.endpoint !== undefined) API_CONFIG.endpoint = config.endpoint;
  if (config.model !== undefined) API_CONFIG.model = config.model;
  if (config.proxy !== undefined) API_CONFIG.proxy = config.proxy;
  try {
    localStorage.setItem('hangzhou_tour_config', JSON.stringify({
      apiKey: API_CONFIG.apiKey,
      endpoint: API_CONFIG.endpoint,
      model: API_CONFIG.model,
      proxy: API_CONFIG.proxy,
    }));
  } catch (e) {
    // 忽略保存错误
  }
}

/**
 * 获取当前配置（用于在 UI 中展示）
 */
function getConfig() {
  return { ...API_CONFIG };
}

// ======================== 请求控制 ========================

// 请求超时时间（毫秒），防止 API 挂起导致界面一直卡在"处理中"
const REQUEST_TIMEOUT_MS = 30000;

// 发送给模型的最近消息条数，避免长会话撑爆上下文窗口
const MAX_CONTEXT_MESSAGES = 10;

// 当前在途请求的 AbortController，用于手动取消
let activeController = null;

/**
 * 取消当前正在进行的 API 请求（如果有）
 */
function cancelRequest() {
  if (activeController) {
    activeController.abort();
    activeController = null;
  }
}

/**
 * 向 AI 导游发送消息
 * @param {Array} messages - 对话历史 [{role: 'user'|'assistant', content: string}]
 * @returns {Promise<string>} - AI 回复文本
 */
async function askTourGuide(messages) {
  if (!API_CONFIG.apiKey || API_CONFIG.apiKey === 'YOUR_API_KEY_HERE') {
    throw new Error('请先配置 API Key（点击下方"设置 API"按钮）');
  }

  // 自动补全 endpoint：如果只填了 base_url，自动加上 /chat/completions
  let endpoint = API_CONFIG.endpoint;
  if (!endpoint.endsWith('/chat/completions')) {
    endpoint = endpoint.replace(/\/+$/, '') + '/chat/completions';
  }

  // 本地代理：解决部分服务商的 CORS 限制（留空则直连）
  const proxy = (API_CONFIG.proxy || '').trim();
  const requestUrl = proxy || endpoint;

  // 只发送最近的 N 条消息，控制上下文长度
  const recentMessages = messages.slice(-MAX_CONTEXT_MESSAGES);

  // 确保同一时间只有一个在途请求，并支持超时自动取消
  cancelRequest();
  const controller = new AbortController();
  activeController = controller;
  let timedOut = false;
  const timeoutId = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, REQUEST_TIMEOUT_MS);

  try {
    const payload = {
      model: API_CONFIG.model,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        ...recentMessages,
      ],
      temperature: 0.7,
      max_tokens: 800,
    };
    // 走代理时，把真实端点一并交给代理转发
    if (proxy) payload.endpoint = endpoint;

    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${API_CONFIG.apiKey}`,
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    if (!response.ok) {
      let errMsg = `API 请求失败 (${response.status})`;
      try {
        const err = await response.json();
        if (err.error?.message) errMsg += `: ${err.error.message}`;
      } catch (e) {
        // 解析错误信息失败，使用默认消息
      }
      throw new Error(errMsg);
    }

    const data = await response.json();
    return data.choices[0].message.content;
  } catch (err) {
    // 超时取消：转成用户可理解的错误；手动取消则原样抛出（由调用方处理）
    if (err.name === 'AbortError' && timedOut) {
      throw new Error('请求超时，请检查网络或 API 服务后重试');
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
    if (activeController === controller) activeController = null;
  }
}

/**
 * 测试 API 连接
 * @returns {Promise<string>} - 测试结果消息
 */
async function testConnection() {
  const testMessages = [
    { role: 'user', content: '你好，请用一句话介绍你自己。' }
  ];
  const response = await askTourGuide(testMessages);
  return response;
}

// 模块加载时自动读取保存的配置
loadConfig();
