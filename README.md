# OpenClaw Mission Control — Personal AI OS

A personal AI assistant platform built on top of [OpenClaw](https://openclaw.ai).
Mission Control is the control plane: it manages agents, boards, tasks, and gateway connections from a web UI, while the OpenClaw gateway runtime handles the actual AI execution and messaging channels.

## What it does

**WhatsApp is the main interface.** A master agent receives messages, handles them directly (calendar, email, quick tasks) or delegates to board-specific lead agents that coordinate specialist agents.

```
Vicente (WhatsApp)
      ↕
Mission Control Master Agent
      ├── Direct: calendar, email, personal tasks, quick answers
      └── Delegate: project work → Board Lead Agent
                        ↕
                  Specialist Agents (frontend, backend, research…)
```

## Features

### Agent management
- **Office Floor** — pixel art agents at desks showing live status (idle, working, offline), organised by board
- **Multi-agent hierarchy** — Master → Board Lead → Specialists with automatic task delegation
- **Board leads** — one coordinator per board, receives delegated tasks, breaks them into subtasks, assigns to specialists
- **Difficulty-based model routing** — tasks auto-classified as easy/medium/hard and routed to Haiku / Sonnet / Opus accordingly

### WhatsApp assistant
- Responds in Spanish or English, always starts with 🤖
- Creates tasks automatically from natural language ("remind me to…", "add a task for…")
- Reads and searches Gmail on demand ("what's my last email?", "any emails from X?")
- Sends emails including long-form content (stories, reports, essays)
- Fetches calendar events from Apple Calendar (or Google Calendar as fallback)
- **Morning briefing** (8:30 Madrid): calendar events + pending tasks
- **Email digest** (8:00 Madrid): summary of overnight emails
- **AI task generation**: "break down X into tasks for the Y board" → generates + creates on confirmation
- Delegates project work to the right board lead, polls for status updates

### Mission Control UI
- **Dashboard** — throughput, workload, error rate, gateway health, session list
- **Boards + Kanban** — tasks with status, priority, difficulty badge, custom fields
- **Live Feed** — real-time activity stream and agent topology panel
- **Approvals** — human-in-the-loop gate for sensitive agent actions
- **Gateways** — connect and manage OpenClaw gateway instances
  - Edit USER.md (agent profile) and SOUL.md (system prompt) live
  - Regenerate SOUL.md from current boards and lead agents
  - **Send trigger** — manually fire `morning_briefing` or `morning_email_digest` without waiting for the cron
- **Task generation** — one-line prompt → AI-generated task breakdown with difficulty, skill tags, and dependencies
- **Dark mode** — full dark theme across all pages

### Infrastructure
- `gog-proxy` — local HTTP proxy (port 8787, localhost only) wrapping the `gog` CLI for Gmail and Calendar access from Docker containers
- Launchd crons on macOS for automated morning triggers
- Compose-based Docker deployment (backend + frontend + Postgres + Redis)

## Architecture

```
WhatsApp ──→ OpenClaw Gateway (port 18789) ──→ Main Agent
                                                    │
                                        Mission Control API (port 8000)
                                                    │
                                           Postgres + Redis
                                                    │
                                        Frontend UI (port 3000)
```

The backend is a FastAPI app. The frontend is Next.js. Agent logic runs entirely inside the OpenClaw gateway — Mission Control stores state and provides the API agents call.

## Environment variables

Key variables to configure (see `backend/.env.example` for the full list):

| Variable | Description |
|----------|-------------|
| `LOCAL_AUTH_TOKEN` | Bearer token for local auth mode (min 50 chars) |
| `ANTHROPIC_API_KEY` | For difficulty auto-classification (Haiku) |
| `GEMINI_API_KEY` | For AI task generation (Gemini Flash) |
| `MAIN_WHATSAPP_NUMBER` | WhatsApp number for the main agent session (e.g. `+34600000000`) |
| `BASE_URL` | Public backend URL (default `http://localhost:8000`) |

## Get started

### 1. Configure environment

```bash
cp .env.example .env
cp backend/.env.example backend/.env
```

Edit both files — at minimum set `LOCAL_AUTH_TOKEN` (50+ chars) and `BASE_URL`.

### 2. Start

```bash
docker compose -f compose.yml --env-file .env up -d --build
```

- Mission Control UI: http://localhost:3000
- Backend API: http://localhost:8000

### 3. Connect a gateway

1. Install and start the [OpenClaw](https://openclaw.ai) gateway
2. Go to **Gateways** in the UI → add your gateway URL and token
3. Pair the gateway → agents can now be provisioned

### 4. Pause (stop all AI API usage)

```bash
# Stop the gateway (no more agent runs)
docker compose stop openclaw-gateway

# Unload morning crons
launchctl unload ~/Library/LaunchAgents/com.vicentefeliu.mc-morning-briefing.plist
launchctl unload ~/Library/LaunchAgents/com.vicentefeliu.mc-email-digest.plist
```

### 5. Resume

```bash
docker compose start openclaw-gateway
launchctl load ~/Library/LaunchAgents/com.vicentefeliu.mc-morning-briefing.plist
launchctl load ~/Library/LaunchAgents/com.vicentefeliu.mc-email-digest.plist
```

Then go to **Gateways** → re-pair → click **Regenerate from boards**.

## Upstream

This is a personal fork of [abhi1693/openclaw-mission-control](https://github.com/abhi1693/openclaw-mission-control).
The upstream project is a general-purpose multi-team operations platform. This fork extends it with personal assistant capabilities, WhatsApp integration, Gmail/Calendar tooling, and a multi-agent delegation hierarchy.

## License

MIT — see [`LICENSE`](./LICENSE).
