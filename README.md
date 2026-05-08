# TeamChat

TeamChat is an open-source multi-agent team chat workspace. It gives AI agent systems a clean web console for realtime messaging, action logs, Markdown-rich conversations, notifications, filtering, mobile layouts, PWA installation, and Android packaging.

The repository is safe to run out of the box: private OpenClaw, WeCom, Weixin, Feishu, Telegram, tunnel, and gateway integrations are disabled by default and represented by mock/adapter status endpoints. Private inbox sync/indexing features are intentionally not shipped in the open-source build.

## Features

- Realtime WebSocket chat with HTTP fallback.
- Multi-agent roster, session labels, channel labels, model labels, and action log cards.
- Markdown rendering with code blocks, tables, file cards, images, links, and compact message layout.
- Notification center with history, service status, and disabled-adapter reminders.
- First-run setup wizard for language, login mode, tunnel URL, avatar directory, local agent discovery, and channel monitoring.
- Chinese/English UI language switching.
- Responsive desktop/mobile UI, PWA assets, service worker, and Capacitor Android project.
- Clean local JSON persistence under `TEAMCHAT_DATA_DIR`.
- Demo mode with a professional sample conversation and mock agent response.

## Quick Start

```bash
cp .env.example .env
npm install
npm start
```

Open [http://localhost:18788](http://localhost:18788).

For frontend development:

```bash
npm run dev
```

The Vite dev server proxies API/WebSocket requests to the TeamChat server on port `18788`.

## Configuration

TeamChat is configured with environment variables:

| Variable | Default | Description |
| --- | --- | --- |
| `TEAMCHAT_PORT` | `18788` | HTTP and WebSocket server port. |
| `TEAMCHAT_DATA_DIR` | `./data` | Runtime data directory for messages, uploads, and notifications. |
| `TEAMCHAT_AUTH_MODE` | `none` | Use `none` for local/demo mode or `password` for password login. |
| `TEAMCHAT_PASSWORD` | empty | Password used when `TEAMCHAT_AUTH_MODE=password`. |
| `TEAMCHAT_DEMO_MODE` | `true` | Seeds a clean demo conversation when no message store exists. |
| `TEAMCHAT_PUBLIC_BASE_URL` | local URL | Public URL shown in startup logs and metadata. |
| `TEAMCHAT_AVATAR_DIR` | `./public/assets/avatars` | Static avatar directory used by agent records. |
| `TEAMCHAT_AGENTS_JSON` | `./config/agents.json` | Optional JSON file for a real local agent roster. |
| `TEAMCHAT_AGENT_DISCOVERY_PATHS` | `./agents,./config/agents.json` | Comma-separated files/folders scanned for local agents. |
| `TEAMCHAT_CHANNELS` | `teamchat,tui,telegram,wecom,weixin,feishu,qqbot` | Channels shown in the monitoring setup view. |
| `TEAMCHAT_*_ENABLED` | `false` | Optional adapter switches for gateway, WeCom, Weixin, Feishu, Telegram, and tunnel integrations. |

Runtime data is intentionally ignored by Git. Delete your local `data/` directory to return to a clean demo state.

## Adapter Model

The open-source build ships with a mock adapter so the UI is useful immediately. Production integrations should be implemented behind the existing endpoints instead of hardcoding private infrastructure:

- `/api/send-to-agent`
- `/v1/gateway`
- `/api/setup`
- `/api/agents/discover`
- `/api/channels/status`
- `/api/health/status`
- `/api/system-metrics`
- `/api/notifications/history`

When an adapter is not configured, the API returns a safe `disabled` status instead of failing or exposing local details.

## Local Agent Discovery

Create `config/agents.json` or point `TEAMCHAT_AGENTS_JSON` to your own file:

```json
{
  "agents": [
    { "id": "planner", "name": "Planner", "role": "Task planning", "img": "agent-main.svg" },
    { "id": "coder", "name": "Coder", "role": "Implementation", "img": "agent-dev.svg" }
  ]
}
```

TeamChat also scans folders listed in `TEAMCHAT_AGENT_DISCOVERY_PATHS`. A folder entry can contain one subfolder per agent with an optional `agent.json`.

## Tunnel, Login, Avatars, And Channels

Open the settings panel from the gear button. It explains the recommended `.env` values for:

- Public tunnel access through `TEAMCHAT_PUBLIC_BASE_URL` and `TEAMCHAT_TUNNEL_ENABLED`.
- Password login through `TEAMCHAT_AUTH_MODE=password` and `TEAMCHAT_PASSWORD`.
- Avatar setup through each agent's `img` field and `TEAMCHAT_AVATAR_DIR`.
- Channel monitoring through `TEAMCHAT_CHANNELS` plus per-channel `TEAMCHAT_<CHANNEL>_ENABLED`, token, webhook, or URL variables.

## Android APK

TeamChat includes a Capacitor Android project and a GitHub Actions workflow for debug APK builds.

```bash
npm run apk:prepare
cd android
./gradlew assembleDebug
```

If you do not have the Android SDK locally, use the GitHub Actions workflow `Build Android APK`.

## Repository Hygiene

Before publishing, run:

```bash
npm run check:clean
npm run build
```

The cleanliness check fails if runtime files, local backups, databases, logs, hardcoded private paths, fixed private domains, or obvious secrets are tracked.

## License

MIT
