# TeamChat 🤖

> Web-based Multi-Agent Collaboration Platform for OpenClaw

[English](#english) | [中文](#中文)

---

## English

### 1. What is TeamChat?

TeamChat is a real-time web console for running and observing multi-agent collaboration workflows.
It is designed to work with an OpenClaw workspace and provides:

- agent status and activity visibility,
- streaming messages and operation logs,
- model/runtime metrics,
- basic operational controls (health, restart, tunnel, etc.).

---

### 2. Core Capabilities

#### 2.1 Multi-Agent Collaboration View
- Monitor multiple agents in one UI.
- View per-agent session activity and recent outputs.
- Track active/inactive states and working trends.

#### 2.2 Real-time Message & Log Streaming
- WebSocket + SSE based updates.
- Supports thinking/tool-call/tool-result style message blocks.
- Preserves and renders historical context for analysis.

#### 2.3 Metrics & System Status
- Runtime health endpoint for service checks.
- Dashboard metrics for request/error/performance tracking.
- Basic gateway and tunnel visibility.

#### 2.4 Built-in Operations for Self-hosting
- Bootstrap script for first-time setup.
- Runtime doctor command for environment diagnosis.
- API-level admin operations for restart/maintenance scenarios.

#### 2.5 Web Experience
- Responsive layout (desktop + mobile).
- Dark/light themes.
- Modular frontend structure (plain JS + CSS).

---

### 3. Architecture

- **Frontend**: Vite + Vanilla JavaScript + CSS
- **Backend**: Node.js (CommonJS server runtime)
- **Realtime**: WebSocket + SSE
- **Data**: better-sqlite3 + filesystem logs/history

---

### 4. Requirements

- Node.js `>= 18`
- npm
- An OpenClaw data directory (default: `$HOME/.openclaw`)

Recommended for production:
- Linux host
- process manager (systemd / PM2)
- reverse proxy (Nginx/Caddy)

---

### 5. Quick Start

```bash
npm install
npm run build
npm start
```

Server default URL:
- `http://0.0.0.0:18788`

---

### 6. One-click Install Script (Recommended for New Hosts)

Run directly from GitHub (default installs to `~/teamchat`):

```bash
curl -fsSL https://raw.githubusercontent.com/openclaw/teamchat/main/scripts/install_teamchat.sh | bash
```

Equivalent explicit command:

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/openclaw/teamchat/main/scripts/install_teamchat.sh)
```

Custom install options:

```bash
TEAMCHAT_DIR=/opt/teamchat \
TEAMCHAT_BRANCH=main \
TEAMCHAT_AUTO_START=true \
bash <(curl -fsSL https://raw.githubusercontent.com/openclaw/teamchat/main/scripts/install_teamchat.sh)
```

Supported environment variables:

| Variable | Default | Description |
|---|---|---|
| `TEAMCHAT_REPO_URL` | `https://github.com/openclaw/teamchat.git` | Repository URL |
| `TEAMCHAT_BRANCH` | `main` | Branch to checkout/update |
| `TEAMCHAT_DIR` | `$HOME/teamchat` | Install directory |
| `TEAMCHAT_AUTO_START` | `false` | Auto-run `npm start` after install |

What the installer does:
1. checks `git` / `node` / `npm`,
2. clones or updates repository,
3. creates `.env` from `.env.example` if missing,
4. runs `npm install`, `npm run build`, `npm run doctor`, `npm run smoke`,
5. prints start command (or starts automatically when enabled).

---

### 7. One-click Bootstrap (for Existing Local Repo)

```bash
# 1) Prepare environment file
cp .env.example .env

# 2) One-click setup
npm run bootstrap

# 3) Start service
npm start
```

What bootstrap does:
1. verifies `node` / `npm`,
2. creates `.env` from `.env.example` if missing,
3. installs dependencies,
4. runs build,
5. runs doctor checks.

---

### 8. Runtime Doctor

```bash
npm run doctor
```

Doctor checks:
- Node major version,
- runtime dependency resolvability,
- `.env.example` presence,
- OpenClaw home directory existence.

---

### 9. Configuration Guide

Configure via `.env`:

| Variable | Default | Description |
|---|---|---|
| `PORT` | `18788` | TeamChat server listening port |
| `GATEWAY_PORT` | `18789` | OpenClaw gateway port used by TeamChat |
| `OPENCLAW_HOME` | `$HOME/.openclaw` | Base directory for agents/config/sessions |
| `WECOM_WEBHOOK_URL` | empty | Optional WeCom webhook for notifications |
| `WECOM_NOTIFY_ENABLED` | `false` | Optional toggle for WeCom notifications |
| `MEM0_API_KEY` | empty | Optional key used by memory API integration |

Notes:
- If `WECOM_WEBHOOK_URL` is empty, webhook notifications are skipped.
- For open-source use, always keep sensitive values in `.env` only.

---

### 10. Common Scripts

```bash
npm run dev        # Frontend dev mode (Vite)
npm run build      # Production build
npm run preview    # Preview built frontend
npm start          # Start backend server
npm run doctor     # Environment/runtime checks
npm run install:oneclick  # Install/update via one-click installer script
npm run bootstrap        # One-click setup for existing local repo
npm run smoke            # End-to-end smoke checks for key routes
```

---

### 10.1 QA / Regression Checklist

- Use `npm run smoke` for automated key-route runtime checks.
- See `QA_CHECKLIST.md` for full pre-release validation list.

---

### 11. Health & Operational Endpoints

- `GET /api/health` - server health summary
- Additional admin/ops endpoints are available in server code and are intended for trusted environments.

Security advice:
- expose admin endpoints only behind authentication and trusted networks,
- avoid direct public access without reverse proxy restrictions.

---

### 12. Deployment Notes (Open-source Self-hosting)

1. Run with process supervisor (systemd/PM2).
2. Put Nginx/Caddy in front of TeamChat.
3. Use HTTPS for all public traffic.
4. Restrict internal ops/admin endpoints.
5. Backup history/session/DB data directories.
6. Pin Node LTS in production.

---

### 13. Troubleshooting

#### `Cannot find module 'xxx'`
- Run `npm install` again.
- Run `npm run doctor`.

#### Starts but warns about missing OpenClaw files
- Ensure `OPENCLAW_HOME` points to a valid OpenClaw workspace.
- Populate required subfolders (agents/config/sessions) as needed.

#### Port already in use
- Change `PORT` in `.env`, then restart.

---

### 14. Project Structure

```text
teamchat/
├── team_chat_server.cjs      # Main backend server
├── admin-apis.cjs            # Admin operation handlers
├── muse-api.cjs              # Muse/task/memory related APIs
├── email_sync_service.cjs    # Email sync service
├── assets/                   # Frontend source assets
├── public/                   # Public static assets
├── scripts/install_teamchat.sh # One-click installer (clone/update + checks)
├── scripts/bootstrap.sh       # One-click setup for existing local repo
├── scripts/doctor.cjs         # Runtime diagnostics
├── scripts/smoke.cjs          # Automated smoke checks
├── .github/workflows/ci.yml   # CI checks
└── .env.example               # Environment template
```

---

### 15. Contributing

Contributions are welcome.
Please submit issues and pull requests with:
- clear reproduction steps,
- environment details,
- expected vs actual behavior,
- logs/screenshots when possible.

---

### 16. License

MIT License. See [LICENSE](LICENSE).

---

## 中文

### 1. TeamChat 是什么？

TeamChat 是一个面向多 Agent 协作场景的实时 Web 控制台，主要用于在 OpenClaw 工作目录上进行可视化运行与监控。

它提供：
- 多 Agent 协作态势展示，
- 消息与日志实时流式更新，
- 系统指标与健康状态查看，
- 面向自部署的基础运维能力。

---

### 2. 核心能力

#### 2.1 多 Agent 协作视图
- 在同一界面观察多个 Agent。
- 按 Agent 查看会话活动和近期输出。
- 跟踪活跃/非活跃状态。

#### 2.2 实时消息与日志流
- 基于 WebSocket + SSE 推送。
- 支持思考、工具调用、工具结果等消息块展示。
- 可结合历史上下文进行回溯分析。

#### 2.3 指标与健康状态
- 提供运行健康接口用于巡检。
- 提供请求/错误/性能等基础指标能力。
- 可查看网关与隧道相关状态。

#### 2.4 开源自部署运维能力
- 一键初始化脚本（bootstrap）。
- 运行环境自检命令（doctor）。
- 提供重启/维护类管理 API（建议仅内网使用）。

#### 2.5 Web 使用体验
- 响应式布局，支持桌面与移动端。
- 深色/浅色主题。
- 前端模块化结构，便于二次开发。

---

### 3. 技术栈

- **前端**：Vite + Vanilla JavaScript + CSS
- **后端**：Node.js（CommonJS 运行）
- **实时通信**：WebSocket + SSE
- **数据层**：better-sqlite3 + 文件系统日志/历史

---

### 4. 运行要求

- Node.js `>= 18`
- npm
- OpenClaw 数据目录（默认 `$HOME/.openclaw`）

生产环境建议：
- Linux 主机
- systemd / PM2 进程守护
- Nginx/Caddy 反向代理

---

### 5. 快速开始

```bash
npm install
npm run build
npm start
```

默认访问地址：
- `http://0.0.0.0:18788`

---

### 6. 一键安装脚本（新机器推荐）

直接从 GitHub 执行（默认安装到 `~/teamchat`）：

```bash
curl -fsSL https://raw.githubusercontent.com/openclaw/teamchat/main/scripts/install_teamchat.sh | bash
```

等价显式写法：

```bash
bash <(curl -fsSL https://raw.githubusercontent.com/openclaw/teamchat/main/scripts/install_teamchat.sh)
```

自定义安装参数示例：

```bash
TEAMCHAT_DIR=/opt/teamchat \
TEAMCHAT_BRANCH=main \
TEAMCHAT_AUTO_START=true \
bash <(curl -fsSL https://raw.githubusercontent.com/openclaw/teamchat/main/scripts/install_teamchat.sh)
```

支持的环境变量：

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `TEAMCHAT_REPO_URL` | `https://github.com/openclaw/teamchat.git` | 仓库地址 |
| `TEAMCHAT_BRANCH` | `main` | 安装/更新分支 |
| `TEAMCHAT_DIR` | `$HOME/teamchat` | 安装目录 |
| `TEAMCHAT_AUTO_START` | `false` | 安装后是否自动执行 `npm start` |

安装脚本会自动执行：
1. 检查 `git` / `node` / `npm`，
2. clone 或更新仓库，
3. 缺失时从 `.env.example` 生成 `.env`，
4. 运行 `npm install`、`npm run build`、`npm run doctor`、`npm run smoke`，
5. 输出启动命令（或按配置自动启动）。

---

### 7. 一键初始化（已有本地仓库推荐）

```bash
# 1）准备环境变量文件
cp .env.example .env

# 2）一键初始化
npm run bootstrap

# 3）启动服务
npm start
```

bootstrap 会自动执行：
1. 检查 `node` / `npm`，
2. 缺失时从 `.env.example` 生成 `.env`，
3. 安装依赖，
4. 构建前端，
5. 运行环境自检。

---

### 8. 运行环境自检

```bash
npm run doctor
```

检查项包括：
- Node 主版本，
- 关键运行依赖是否可解析，
- `.env.example` 是否存在，
- OpenClaw 根目录是否存在。

---

### 9. 配置项说明

通过 `.env` 配置：

| 变量名 | 默认值 | 说明 |
|---|---|---|
| `PORT` | `18788` | TeamChat 服务监听端口 |
| `GATEWAY_PORT` | `18789` | TeamChat 访问 OpenClaw 网关端口 |
| `OPENCLAW_HOME` | `$HOME/.openclaw` | Agent、配置、会话数据根目录 |
| `WECOM_WEBHOOK_URL` | 空 | 可选：企业微信通知 webhook |
| `WECOM_NOTIFY_ENABLED` | `false` | 可选：是否启用企业微信通知 |
| `MEM0_API_KEY` | 空 | 可选：记忆能力 API Key |

说明：
- 未设置 `WECOM_WEBHOOK_URL` 时会跳过 webhook 通知。
- 密钥类配置务必仅放在 `.env`，不要提交到仓库。

---

### 10. 常用命令

```bash
npm run dev        # 前端开发模式（Vite）
npm run build      # 生产构建
npm run preview    # 构建产物预览
npm start          # 启动后端服务
npm run doctor     # 环境/依赖自检
npm run install:oneclick  # 一键安装/更新（脚本方式）
npm run bootstrap         # 本地仓库一键初始化
npm run smoke             # 关键路径自动化冒烟测试
```

---

### 10.1 QA / 回归检查清单

- 使用 `npm run smoke` 做核心路由自动化冒烟验证。
- 发布前请按 `QA_CHECKLIST.md` 做完整检查。

---

### 11. 健康检查与运维接口

- `GET /api/health`：服务健康信息
- 其余 admin/ops 接口见后端代码，建议仅在受信网络中开放。

安全建议：
- 管理类接口务必配合鉴权与网络隔离；
- 公网暴露时建议加反向代理与访问控制。

---

### 12. 部署注意事项（开源自部署）

1. 使用 systemd/PM2 守护进程。
2. 使用 Nginx/Caddy 反向代理并启用 HTTPS。
3. 限制内部管理接口访问来源。
4. 定期备份历史/会话/数据库目录。
5. 生产环境固定 Node LTS 版本。

---

### 13. 常见问题排查

#### 报错 `Cannot find module 'xxx'`
- 重新执行 `npm install`
- 执行 `npm run doctor`

#### 能启动但提示缺少 OpenClaw 相关文件
- 检查 `OPENCLAW_HOME` 是否指向正确目录
- 检查 agents/config/sessions 等子目录是否存在

#### 端口占用
- 修改 `.env` 中 `PORT` 后重启服务

---

### 14. 目录结构

```text
teamchat/
├── team_chat_server.cjs      # 主后端服务
├── admin-apis.cjs            # 管理类 API
├── muse-api.cjs              # 任务/记忆相关 API
├── email_sync_service.cjs    # 邮件同步服务
├── assets/                   # 前端源码资源
├── public/                   # 公共静态资源
├── scripts/install_teamchat.sh # 一键安装脚本（clone/update + 校验）
├── scripts/bootstrap.sh       # 本地仓库一键初始化脚本
├── scripts/doctor.cjs         # 运行环境自检
├── scripts/smoke.cjs          # 自动化冒烟测试
├── .github/workflows/ci.yml   # CI 检查
└── .env.example               # 环境变量模板
```

---

### 15. 贡献说明

欢迎提交 Issue / PR，建议包含：
- 复现步骤，
- 运行环境信息，
- 预期行为与实际行为，
- 必要日志或截图。

---

### 16. 许可证

MIT License，详见 [LICENSE](LICENSE)。
