# AI 杭州导游 - 语音交互导览

> 主题五：AI + 人本关怀 — 为视障人士设计的智能语音导览

## 项目简介

本项目是一个基于 AI 语音交互的杭州导览网页，专为视障人士设计。用户可以通过语音提问，AI 导游将以语音形式介绍杭州的美景、文化和美食。

**技术栈：**
- 纯前端实现，无需后端服务器
- Web Speech API（语音识别 + 语音合成）
- 大语言模型 API（OpenAI 兼容接口）
- 可选本地代理（`server.py`，仅用于解决部分 API 的 CORS 限制）

## 使用前配置

### 1. 获取 API Key

本项目支持任何 OpenAI 兼容的 API 接口，推荐以下选择：

| 服务商 | 端点 | 推荐模型 |
|--------|------|----------|
| OpenAI | `https://api.openai.com/v1/chat/completions` | `gpt-4o` / `gpt-4o-mini` |
| DeepSeek | `https://api.deepseek.com/v1/chat/completions` | `deepseek-chat` |
| Moonshot (月之暗面) | `https://api.moonshot.cn/v1/chat/completions` | `moonshot-v1-8k` |
| SiliconFlow | `https://api.siliconflow.cn/v1/chat/completions` | 可选多种模型 |

### 2. 配置方式

**方式一：编辑 `js/api.js` 文件**
打开 `js/api.js`，找到 `API_CONFIG` 对象，填入你的 API Key 等信息。

**方式二：网页界面配置（推荐）**
1. 打开网页后，点击左下角的"⚙️ 设置 API"按钮
2. 在弹出的设置面板中填入 API Key、端点 URL 和模型名称
3. 若直连报 CORS 错误，可运行 `server.py` 并把"本地代理地址"填为
   `http://localhost:8080/api/chat`（留空则直连）
4. 点击"保存"并可选"测试连接"验证
5. 配置会自动保存到浏览器本地存储

### 3. 运行方式

**方式一：直接打开（可能因 CORS 策略受限）**
```bash
# 直接双击 index.html 在浏览器打开
```

**方式二：使用本地服务器（推荐）**
```bash
# 使用 Python
python -m http.server 8080

# 或使用 Node.js
npx serve .
```
然后在浏览器访问 `http://localhost:8080`

**方式三：本地服务器 + CORS 代理（解决部分 API 的跨域限制）**
```bash
python server.py
```
然后在"设置 API"中把"本地代理地址"填为 `http://localhost:8080/api/chat`。
此方式同时提供静态文件服务和 `/api/chat` 转发，仅依赖 Python 3 标准库。

### 4. 浏览器兼容性

- 语音识别功能需要 **Chrome 浏览器**（推荐）
- 语音合成在 Chrome、Edge、Safari 均可使用
- 请确保浏览器允许麦克风权限

## 项目结构

```
├── index.html          # 主页面
├── css/
│   └── style.css       # 样式表
├── js/
│   ├── app.js          # 主应用逻辑
│   ├── speech.js       # 语音识别与合成
│   ├── api.js          # LLM API 调用（支持直连或本地代理）
│   └── prefs.js        # 用户偏好设置（字号、语音、反馈）
├── server.py           # 可选：本地静态服务器 + CORS 代理
├── .gitignore
└── README.md           # 项目文档
```

## 安全说明

- API Key 仅保存在本机浏览器的 localStorage 中，**请勿在公共电脑上使用**
  或分享网页截图/源码中的 Key
- 若需部署到公网，建议改用后端代理转发，不要把 Key 暴露给浏览器

## 功能特性

- 🎤 语音提问：点击麦克风按钮，说出你想了解的杭州景点
- 🔊 语音回答：AI 导游用语音介绍，配合文字显示
- ⌨️ 文字输入：也支持键盘输入问题
- 💡 快捷提问：预设问题一键提问
- ♿ 无障碍设计：高对比度、大按钮、ARIA 标签、键盘导航、焦点锁定
- 🔠 字号调节：A− / A+ 按钮随时调整页面字号并自动记住
- 🗣️ 语音设置：可调语速、音量、音色，支持试听
- ✨ 实时识别：说话时实时显示识别文字，配操作提示音
- 💬 对话管理：支持清空对话；默认刷新后保留最近对话记录
- 📱 响应式布局：手机和桌面均可使用

## 团队

团队成员信息见网页"③ 人员分工"部分。

## 许可证

本项目仅供学习交流使用。
