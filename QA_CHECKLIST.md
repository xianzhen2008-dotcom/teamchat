# TeamChat QA Checklist (Open-source Runtime)

This checklist is for maintainers before release and for contributors validating local changes.

## 1) Environment

- Node.js >= 18
- npm installed
- `.env` exists (copy from `.env.example` if needed)
- `OPENCLAW_HOME` prepared if testing with real OpenClaw data

## 2) Required commands

```bash
npm install
npm run build
npm run doctor
npm run smoke
```

## 3) Smoke test coverage (`npm run smoke`)

- Start backend server process and wait for readiness (`/api/health`)
- `GET /api/health` -> 200 + `status: ok`
- `GET /api/agents` -> 200 + JSON array
- `GET /api/agents/status` -> 200 + JSON object with `agents`
- `GET /api/system-metrics` -> 200 + metrics payload (`teamchat`, `memory`)
- `GET /` -> HTML document
- `GET /assets/js/main.js` -> frontend JS asset

## 4) Manual checks (recommended for release)

- Login workflow works (`/api/login`, `/api/check-auth`)
- Agent logs stream endpoint is reachable in browser
- Dashboard and sidebar load correctly
- WebSocket upgrade path works in deployment env (behind proxy)
- Optional integrations (tunnel, webhook, and chat-channel adapters) behave as expected when configured

## 5) Known clean-environment warnings (non-fatal)

In a minimal environment without full OpenClaw workspace, the server may log warnings like:

- `Failed to load gateway token`
- `Agents directory not found`
- `Sync script not found`

These are expected unless corresponding OpenClaw files/directories are provisioned.
