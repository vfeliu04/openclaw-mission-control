# Live Feed Page — Changes Made (Mar 30 2026)

## File changed
`frontend/src/app/activity/page.tsx` (1555 lines → 1937 lines)

## What was added

### New components

**`AgentTopologyPanel`** — rendered above the event feed
- Splits agents into "lead" (`is_board_lead || is_gateway_main`) and "worker" groups
- Lead agents shown in a highlighted row (blue border ring)
- Workers in a responsive grid (1→2→3→4 cols)
- Shows live online count with pulsing indicator in panel header
- Shows "No agents registered yet" empty state if no agents

**`AgentCard`** — one card per agent
- Pulsing `animate-ping` green dot when online, grey when offline (top-right corner)
- Avatar: colored blue for leads, emerald for online workers, grey for offline
- Name + "Lead" badge (if applicable)
- Role from `agent.identity_profile.role`
- "Working on" box showing most recent task event for this agent (with verb: "Working on" / "Commented on" / "Updated status of" / "Created")
- "View board →" link
- Relative timestamp ("3m ago", "just now")

### New state

| State | Type | Purpose |
|-------|------|---------|
| `agentsState` | `Agent[]` | React state mirror of `agentsByIdRef` — drives topology panel re-renders |
| `agentLatestTaskRef` | `Map<agentId, AgentTaskInfo>` | Ref tracking latest task per agent (no re-renders) |
| `agentTaskMap` | `Map<agentId, AgentTaskInfo>` | React state copy — synced when task events arrive |

`AgentTaskInfo` = `{ title, boardName, eventType, updatedAt }`

### Where state is updated
- **`agentsState`**: set after snapshot loading completes + on every agent SSE event
- **`agentTaskMap`**: updated inside task SSE handler when `payload.activity.agent_id` is present, and for task comments when `payload.comment.agent_id` is present

### New helper
`formatRelativeTime(value: string)` — returns "just now", "3m ago", "2h ago", or falls back to `formatShortTimestamp`

### Enhanced `FeedCard`
- `board.chat` / `board.command` events: teal `MessageSquare` icon avatar instead of letter, teal border tint
- `agent.online` events: pulsing green dot overlaid on avatar corner
- Chat message body uses `text-slate-700` (softer) instead of `text-slate-900`

### Enhanced page header
- Pulsing "Live" pill badge next to title
- "X agents online" count in subtitle (from `onlineAgentCount`)
- "Streaming" label with Radio icon top-right

## What was NOT changed
All existing SSE streaming logic is untouched:
- Task stream per board (with exponential backoff reconnection)
- Approval stream per board
- Board memory (chat) stream per board
- Agent stream (org-level, admin only)
- Feed deduplication (`seenIdsRef`)
- Deep-link highlighting + scroll-to
- `MAX_FEED_ITEMS = 300` cap
- All `mapTaskActivity`, `mapTaskComment`, `mapApprovalEvent`, `mapBoardChat`, `mapAgentEvent` functions

## Design decisions
- Used `setAgentsState(Array.from(agentsByIdRef.current.values()))` (stable setter, no extra deps in SSE effects)
- Did NOT use a single `useReducer` — kept it as separate state slices for clarity
- `AgentTopologyPanel` uses `useMemo` internally for lead/worker split and online count
- No new dependencies added — uses existing `animate-ping` from Tailwind + `tailwindcss-animate`
