# Integration Map: openclaw ↔ mission-control

This is the most important file for cross-repo work. It shows exactly how the two systems connect.

## Connection Overview

```
openclaw (TypeScript, Docker)          mission-control backend (Python, Docker)
─────────────────────────────          ──────────────────────────────────────────
Gateway WebSocket :18789        ←────→  backend/app/services/openclaw/gateway_rpc.py
  JSON frames (req/res/event)           WebSocket client using `websockets` 16
```

Mission control is always the **client**. openclaw gateway is always the **server**.

## Concept Mapping

| openclaw concept | mission-control counterpart | File |
|------------------|-----------------------------|------|
| Gateway WebSocket at `:18789` | Gateway DB record + RPC client | `models/gateways.py`, `services/openclaw/gateway_rpc.py` |
| `connect` handshake | Device identity + signed nonce | `services/openclaw/device_identity.py` |
| Device token (RSA keypair + signature) | Stored device credentials | `services/openclaw/device_identity.py` |
| `exec.approval.request` RPC | Approval record creation | `api/approvals.py`, `models/approvals.py` |
| Agent `role: "node"` | `Agent.is_gateway_main = True` | `models/agents.py` |
| Agent `role: "operator"` (lead) | `Agent.is_board_lead = True` | `models/agents.py` |
| Session (`openclaw_session_id`) | `Agent.openclaw_session_id` | `models/agents.py` |
| `agent` SSE event frame | Agent streaming endpoint | `api/agents.py` (stream route) |
| `OPENCLAW_GATEWAY_TOKEN` | Stored in Gateway record | `models/gateways.py` |
| Gateway health (`/healthz`) | Gateway status checks | `services/openclaw/gateway_rpc.py` |
| `chat.send` RPC method | Board memory/chat | `models/board_memory.py` |
| Task execution dispatch | `exec.*` RPC methods | `services/openclaw/gateway_dispatch.py` |
| Agent provisioning | `agent.create` / onboarding flow | `services/openclaw/provisioning.py` |
| Agent lifecycle (online/offline) | `Agent.status` + activity events | `services/openclaw/lifecycle_orchestrator.py` |

## The `services/openclaw/` Integration Layer

This is the heart of the integration — 28 modules in `backend/app/services/openclaw/`:

| Module | What it does |
|--------|-------------|
| `gateway_rpc.py` | Low-level WebSocket RPC client. Sends JSON-RPC frames, awaits responses, handles timeouts. |
| `gateway_dispatch.py` | Higher-level dispatch: picks the right gateway, builds the payload, calls `gateway_rpc`. |
| `device_identity.py` | Generates RSA keypair, signs the challenge nonce for the `connect` handshake. |
| `provisioning.py` | Full agent provisioning flow: creates Agent record, calls gateway, waits for ack. |
| `lifecycle_orchestrator.py` | Handles agent online/offline transitions, heartbeat tracking. |
| `session_service.py` | Maps openclaw sessions to mission control Agent records. |
| `coordination_service.py` | Multi-gateway coordination (when multiple gateways exist). |
| `policies.py` | Task execution policies (what needs approval, what can run directly). |
| `onboarding_service.py` | First-time gateway setup flow. |
| `admin_service.py` | Admin-level gateway operations. |
| `db_service.py` | DB operations specific to the openclaw integration layer. |

## Gateway Protocol (what mission control actually sends)

The RPC frames follow this structure (from `src/gateway/protocol/schema.ts` in openclaw):

```json
// Request
{ "type": "req", "id": "uuid", "method": "exec.approval.request", "params": { ... } }

// Response
{ "type": "res", "id": "uuid", "ok": true, "payload": { ... } }

// Event (server-push)
{ "type": "event", "event": "agent.status", "payload": { ... }, "seq": 42 }
```

Key methods mission control calls on the gateway:
- `exec.approval.request` — triggers human-approval gate in openclaw
- `agent.wait` — waits for agent to become available
- `sessions.list` / `sessions.patch` — session management
- `config.get` / `config.set` — gateway configuration
- `nodes.invoke` — execute a capability on a node
- `status` / `system-presence` — health checks

## Auth Flow (connect handshake)

```
mission-control                         openclaw gateway
──────────────                          ────────────────
                    ← connect.challenge (nonce)
device_identity.py signs nonce
  with RSA private key
connect request → (device.fingerprint,
                   device.publicKey,
                   device.signature,
                   device.signedTimestamp,
                   device.nonce,
                   auth.token)
                    → validates signature + token
                    ← hello-ok (protocol version, policy, device token)
```

## Approval Flow (end-to-end)

```
openclaw agent wants to do something sensitive
  → calls exec.approval.request on gateway
  → gateway forwards to mission-control via webhook/RPC callback
  → mission-control creates Approval record (status=pending)
  → frontend SSE stream pushes approval.created event to browser
  → operator sees approval in /approvals UI
  → operator clicks Approve/Reject
  → mission-control updates Approval record
  → mission-control calls gateway RPC to unblock the agent
  → agent proceeds or is denied
```

## Known Gaps / Areas Needing Work

1. **Workspace path**: openclaw workspace is at `/home/node/prompt-pilot` inside Docker, but mission control needs to know this path to construct correct task contexts
2. **Real-time agent status**: openclaw pushes agent events via WS event frames, but mission control polls for agent status — could be made fully reactive
3. **Channel awareness**: mission control has no visibility into which channels (WhatsApp, Telegram, etc.) an agent is active on
4. **Prompt Pilot integration**: the workspace is mounted but the integration scope isn't yet defined

## Recommended Starting Files for Integration Work

When making changes that touch both repos, start here:

**openclaw side:**
1. `src/gateway/protocol/schema.ts` — canonical protocol (what methods/payloads exist)
2. `src/gateway/server-methods/` — RPC handler implementations
3. `docs/gateway/protocol.md` — human-readable protocol docs

**mission-control side:**
1. `backend/app/services/openclaw/gateway_rpc.py` — RPC client (how MC calls openclaw)
2. `backend/app/services/openclaw/gateway_dispatch.py` — dispatch logic
3. `backend/app/core/config.py` — gateway config settings
