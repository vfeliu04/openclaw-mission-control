# Claude Memory — OpenClaw Mission Control

## How to use this in a new session

1. Add both repos to your context:
   - `/Users/vicentefeliu/Documents/Computer Science  Projects/Personal Projects/DiogoProject/openclaw`
   - `/Users/vicentefeliu/Documents/Computer Science  Projects/Personal Projects/DiogoProject/openclaw-mission-control`
2. Read **openclaw's** `claude_memory/HANDOFF.md` first — it covers all three projects and current infrastructure state
3. Then read this repo's `claude_memory/MISSION_CONTROL_ARCHITECTURE.md` and `claude_memory/INTEGRATION_MAP.md`
4. The live feed page was just rebuilt — see `claude_memory/LIVE_FEED_CHANGES.md`

## The Three Projects

| Project | Path | Role |
|---------|------|------|
| **openclaw** | `DiogoProject/openclaw` | AI gateway runtime (WebSocket on port 18789), agent execution, 25+ messaging channels |
| **openclaw-mission-control** | `DiogoProject/openclaw-mission-control` | Control plane web UI — boards, tasks, agents, approvals, live feed |
| **Prompt Pilot** | `Personal Projects/Prompt Pilot` | Personal project mounted into the openclaw Docker container at `/home/node/prompt-pilot` as the agent workspace |

## Current infrastructure state

- openclaw gateway: Docker, port 18789, `ws://host.docker.internal:18789` from mission control's perspective
- openclaw-mission-control: Docker, port 3000 (frontend) + 8000 (backend)
- Gateway token in openclaw: `683d9bb1240a3b7f9163c234176e41ed1ed7a50f7407a7cef39d10c36d5c3df3`
- Agent model: `anthropic/claude-sonnet-4-6`
