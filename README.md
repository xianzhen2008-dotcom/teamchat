# TeamChat 🤖

> Web-based Multi-Agent Collaboration Platform for OpenClaw

[English](#english) | [中文](#中文)

---

## English

### Overview

TeamChat is a real-time web-based platform for AI Agent team collaboration and monitoring. Built for OpenClaw, it provides visual monitoring of multiple AI agents working together, with real-time messaging, task tracking, and performance metrics.

### Features

- 🤖 **Multi-Agent Management** - Monitor multiple AI agents collaborating in real-time
- 💬 **Real-time Messaging** - WebSocket communication with live agent thinking and tool execution display
- 📊 **Performance Monitoring** - Real-time metrics and resource usage visualization
- 📱 **Responsive Design** - Desktop and mobile support
- 🎨 **Theme Switching** - Dark/Light theme support
- 📝 **Activity Logs** - Detailed agent operation logs

### Tech Stack

- **Frontend**: Vite + Vanilla JavaScript + CSS
- **Backend**: Node.js + Express
- **Communication**: WebSocket + SSE
- **Database**: better-sqlite3

### Quick Start

```bash
# Install dependencies
npm install

# Development mode
npm run dev

# Production build
npm run build

# Start server
npm start
```

### Project Structure

```
teamchat/
├── index.html          # Main entry
├── team_chat_server.cjs # Backend server
├── package.json        # Project config
├── vite.config.js      # Vite configuration
├── assets/             # Frontend assets
│   ├── css/           # Stylesheets
│   └── js/            # JavaScript modules
└── public/            # Static assets
```

### Agent Roles

| Agent | Role |
|-------|------|
| main | Main Coordinator |
| mail | Email Processing |
| data | Data Analysis |
| dev | Development |
| writer | Content Creation |
| pm | Product Management |
| devops | Operations |
| mobile | Mobile Development |
| frontend | Frontend Development |
| backend | Backend Development |
| qa | Quality Assurance |
| finance | Financial Analysis |

### Configuration

Configure in `team_chat_server.cjs`:
- WebSocket port
- Static file paths
- Agent sessions directory
- Log storage paths

### License

MIT License - See [LICENSE](LICENSE)

### Contributing

Contributions welcome! Please submit Issues and Pull Requests.

---

## 中文

### 简介

TeamChat 是一个基于 Web 的 AI Agent 团队协作和监控平台，支持实时消息、任务跟踪和性能监控。

### 功能特性

- 🤖 **多 Agent 管理** - 支持多个 AI Agent 同时协作
- 💬 **实时消息** - WebSocket 实时通信，显示 Agent 思考和工具调用过程
- 📊 **性能监控** - 实时显示 Agent 运行指标和资源使用
- 📱 **响应式设计** - 支持桌面端和移动端
- 🎨 **主题切换** - 支持深色/浅色主题
- 📝 **工作日志** - 查看 Agent 详细运行日志

### 快速开始

```bash
# 安装依赖
npm install

# 开发模式
npm run dev

# 生产构建
npm run build

# 启动服务器
npm start
```

### 相关链接

- [OpenClaw](https://github.com/openclawopenclaw/teamchat) - 底层 AI 助手框架
- [文档](https://docs.openclaw.ai)
