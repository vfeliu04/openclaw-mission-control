"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { AgentRead } from "@/api/generated/model/agentRead";
import { TaskCardRead } from "@/api/generated/model/taskCardRead";
import { TaskCardReadStatus } from "@/api/generated/model/taskCardReadStatus";
import { AgentDeskTile } from "@/components/organisms/AgentDeskTile";

interface AgentOfficeFloorProps {
  agents: AgentRead[];
  tasks: TaskCardRead[];
  boardName?: string;
  boardsById?: Record<string, string>;
}

// ─── Tile floor background ────────────────────────────────────────────────────
const TILE_SVG = encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" width="32" height="32">' +
    '<rect width="32" height="32" fill="#c4bfb8"/>' +
    '<rect x="0" y="0" width="31" height="31" fill="#bfbab3"/>' +
    '<rect x="0" y="0" width="32" height="1" fill="rgba(255,255,255,0.3)"/>' +
    '<rect x="0" y="0" width="1" height="32" fill="rgba(255,255,255,0.3)"/>' +
  '</svg>'
);

const tileBg: React.CSSProperties = {
  backgroundImage: `url("data:image/svg+xml,${TILE_SVG}")`,
  backgroundColor: "#bfbab3",
  backgroundRepeat: "repeat",
};

// ─── Pixel art decorations ────────────────────────────────────────────────────

function PixelPlant({ size = 52 }: { size?: number }) {
  return (
    <svg viewBox="0 0 22 28" width={size * 0.75} height={size} style={{ imageRendering: "pixelated" }}>
      {/* Leaves */}
      <rect x="9" y="0" width="4" height="8" fill="#16a34a" />
      <rect x="5" y="3" width="6" height="7" fill="#22c55e" />
      <rect x="11" y="3" width="6" height="7" fill="#22c55e" />
      <rect x="7" y="1" width="8" height="6" fill="#4ade80" />
      {/* Stem */}
      <rect x="10" y="8" width="2" height="4" fill="#15803d" />
      {/* Pot rim */}
      <rect x="5" y="12" width="12" height="2" fill="#a16207" />
      {/* Pot body */}
      <rect x="6" y="14" width="10" height="8" fill="#ca8a04" />
      <rect x="7" y="22" width="8" height="2" fill="#a16207" />
      {/* Soil */}
      <rect x="6" y="13" width="10" height="2" fill="#292524" />
    </svg>
  );
}

function PixelWindow({ wide = false }: { wide?: boolean }) {
  const w = wide ? 52 : 38;
  return (
    <svg viewBox={`0 0 ${w} 32`} width={w * 1.5} height={48} style={{ imageRendering: "pixelated" }}>
      {/* Outer frame */}
      <rect x="0" y="0" width={w} height="32" fill="#d6d3ce" />
      {/* Window sill */}
      <rect x="0" y="28" width={w} height="4" fill="#e7e2da" />
      {/* Glass */}
      <rect x="2" y="2" width={w - 4} height="26" fill="#bae6fd" />
      {/* Frame bars */}
      <rect x="2" y="2" width={w - 4} height="2" fill="#f8fafc" />
      <rect x="2" y="26" width={w - 4} height="2" fill="#f8fafc" />
      <rect x="2" y="2" width="2" height="26" fill="#f8fafc" />
      <rect x={w - 4} y="2" width="2" height="26" fill="#f8fafc" />
      {/* Vertical divider */}
      <rect x={w / 2 - 1} y="2" width="2" height="26" fill="#f8fafc" />
      {/* Horizontal divider */}
      <rect x="2" y="14" width={w - 4} height="2" fill="#f8fafc" />
      {/* Sky & clouds */}
      <rect x="5" y="4" width="6" height="3" fill="#e0f2fe" />
      <rect x="4" y="5" width="8" height="3" fill="#e0f2fe" />
      {!wide && <rect x="24" y="6" width="5" height="3" fill="#e0f2fe" />}
      {wide && <>
        <rect x="22" y="4" width="6" height="3" fill="#e0f2fe" />
        <rect x="38" y="6" width="7" height="3" fill="#e0f2fe" />
      </>}
      {/* Sun (top right of right pane) */}
      <rect x={w - 9} y="4" width="4" height="4" fill="#fde68a" />
    </svg>
  );
}

function PixelChart() {
  return (
    <svg viewBox="0 0 34 26" width={51} height={39} style={{ imageRendering: "pixelated" }}>
      {/* Frame */}
      <rect x="0" y="0" width="34" height="26" fill="#78716c" />
      <rect x="1" y="1" width="32" height="24" fill="#1e293b" />
      {/* Title bar */}
      <rect x="2" y="2" width="30" height="3" fill="#334155" />
      <rect x="3" y="3" width="10" height="1" fill="#94a3b8" />
      {/* Bar chart */}
      <rect x="4"  y="10" width="4" height="12" fill="#ef4444" />
      <rect x="10" y="14" width="4" height="8"  fill="#3b82f6" />
      <rect x="16" y="11" width="4" height="11" fill="#22c55e" />
      <rect x="22" y="7"  width="4" height="15" fill="#f59e0b" />
      <rect x="28" y="13" width="3" height="9"  fill="#a78bfa" />
      {/* Grid lines */}
      <rect x="3" y="10" width="28" height="1" fill="#475569" opacity="0.6" />
      <rect x="3" y="15" width="28" height="1" fill="#475569" opacity="0.6" />
      <rect x="3" y="20" width="28" height="1" fill="#475569" opacity="0.6" />
    </svg>
  );
}

function PixelShelf() {
  return (
    <svg viewBox="0 0 36 40" width={54} height={60} style={{ imageRendering: "pixelated" }}>
      {/* Cabinet sides */}
      <rect x="0" y="0" width="36" height="40" fill="#92400e" />
      <rect x="2" y="2" width="32" height="36" fill="#78350f" />
      {/* Shelves */}
      <rect x="2" y="15" width="32" height="2" fill="#92400e" />
      <rect x="2" y="29" width="32" height="2" fill="#92400e" />
      {/* Top shelf books */}
      <rect x="3"  y="3"  width="3" height="11" fill="#ef4444" />
      <rect x="7"  y="5"  width="4" height="9"  fill="#3b82f6" />
      <rect x="12" y="3"  width="3" height="11" fill="#22c55e" />
      <rect x="16" y="4"  width="4" height="10" fill="#f59e0b" />
      <rect x="21" y="3"  width="3" height="11" fill="#8b5cf6" />
      <rect x="25" y="5"  width="4" height="9"  fill="#ec4899" />
      <rect x="30" y="4"  width="3" height="10" fill="#06b6d4" />
      {/* Mid shelf books */}
      <rect x="3"  y="18" width="4" height="10" fill="#84cc16" />
      <rect x="8"  y="19" width="3" height="9"  fill="#f97316" />
      <rect x="12" y="17" width="4" height="11" fill="#6366f1" />
      <rect x="17" y="19" width="5" height="9"  fill="#14b8a6" />
      <rect x="23" y="18" width="3" height="10" fill="#fbbf24" />
      <rect x="27" y="20" width="4" height="8"  fill="#f43f5e" />
      {/* Bottom shelf */}
      <rect x="3"  y="31" width="3" height="7"  fill="#a3e635" />
      <rect x="7"  y="32" width="5" height="6"  fill="#38bdf8" />
      <rect x="13" y="31" width="4" height="7"  fill="#fb923c" />
      <rect x="18" y="32" width="3" height="6"  fill="#c084fc" />
      <rect x="22" y="31" width="5" height="7"  fill="#34d399" />
      <rect x="28" y="32" width="5" height="6"  fill="#f472b6" />
    </svg>
  );
}

function PixelFilingCabinet() {
  return (
    <svg viewBox="0 0 20 32" width={30} height={48} style={{ imageRendering: "pixelated" }}>
      {/* Body */}
      <rect x="0" y="0" width="20" height="32" fill="#64748b" />
      <rect x="1" y="1" width="18" height="30" fill="#94a3b8" />
      {/* Drawers */}
      <rect x="2" y="2"  width="16" height="8"  fill="#cbd5e1" />
      <rect x="2" y="12" width="16" height="8"  fill="#cbd5e1" />
      <rect x="2" y="22" width="16" height="8"  fill="#cbd5e1" />
      {/* Handles */}
      <rect x="7" y="5"  width="6" height="2" fill="#475569" />
      <rect x="7" y="15" width="6" height="2" fill="#475569" />
      <rect x="7" y="25" width="6" height="2" fill="#475569" />
      {/* Dividers between drawers */}
      <rect x="2" y="10" width="16" height="2" fill="#64748b" />
      <rect x="2" y="20" width="16" height="2" fill="#64748b" />
    </svg>
  );
}

function PixelPoster() {
  return (
    <svg viewBox="0 0 28 24" width={42} height={36} style={{ imageRendering: "pixelated" }}>
      {/* Frame */}
      <rect x="0" y="0" width="28" height="24" fill="#d97706" />
      <rect x="1" y="1" width="26" height="22" fill="#fef3c7" />
      {/* Motivational bar chart shape (abstract art) */}
      <rect x="3" y="3" width="22" height="18" fill="#fffbeb" />
      {/* Simple pixel art smiley faces like the reference */}
      <rect x="4"  y="4" width="6" height="6" fill="#fb923c" />
      <rect x="5"  y="5" width="1" height="1" fill="#1c1917" />
      <rect x="8"  y="5" width="1" height="1" fill="#1c1917" />
      <rect x="5"  y="8" width="4" height="1" fill="#1c1917" />
      <rect x="12" y="4" width="6" height="6" fill="#4ade80" />
      <rect x="13" y="5" width="1" height="1" fill="#1c1917" />
      <rect x="16" y="5" width="1" height="1" fill="#1c1917" />
      <rect x="13" y="8" width="4" height="1" fill="#1c1917" />
      <rect x="4"  y="13" width="6" height="6" fill="#60a5fa" />
      <rect x="5"  y="14" width="1" height="1" fill="#1c1917" />
      <rect x="8"  y="14" width="1" height="1" fill="#1c1917" />
      <rect x="5"  y="17" width="4" height="1" fill="#1c1917" />
      <rect x="12" y="13" width="6" height="6" fill="#f472b6" />
      <rect x="13" y="14" width="1" height="1" fill="#1c1917" />
      <rect x="16" y="14" width="1" height="1" fill="#1c1917" />
      <rect x="13" y="17" width="4" height="1" fill="#1c1917" />
      {/* Right column decorations */}
      <rect x="21" y="4" width="5" height="16" fill="#e2e8f0" />
      <rect x="22" y="5" width="3" height="2"  fill="#94a3b8" />
      <rect x="22" y="9" width="3" height="2"  fill="#94a3b8" />
      <rect x="22" y="13" width="3" height="2" fill="#94a3b8" />
    </svg>
  );
}

// ─── Decoration sets (cycles by room index) ──────────────────────────────────
type DecoType = "plant" | "window" | "chart" | "shelf" | "filing" | "poster" | "wideWindow";

const DECO_SETS: DecoType[][] = [
  ["shelf",      "wideWindow", "chart",  "plant",  "filing"],
  ["wideWindow", "poster",     "shelf",  "plant",  "chart"],
  ["chart",      "shelf",      "poster", "wideWindow", "plant"],
  ["filing",     "wideWindow", "chart",  "shelf",  "plant"],
];

function DecoElement({ type }: { type: DecoType }) {
  switch (type) {
    case "plant":       return <PixelPlant />;
    case "window":      return <PixelWindow />;
    case "wideWindow":  return <PixelWindow wide />;
    case "chart":       return <PixelChart />;
    case "shelf":       return <PixelShelf />;
    case "filing":      return <PixelFilingCabinet />;
    case "poster":      return <PixelPoster />;
    default:            return null;
  }
}

// ─── Back wall ────────────────────────────────────────────────────────────────
function BackWall({ roomIndex, label, agentCount }: { roomIndex: number; label: string; agentCount: number }) {
  const decos = DECO_SETS[roomIndex % DECO_SETS.length];

  return (
    <div
      className="relative flex items-end overflow-hidden"
      style={{
        backgroundColor: "#f0ebe3",
        borderBottom: "4px solid #8b7355",
        minHeight: 68,
        padding: "8px 16px 0 16px",
        gap: 12,
      }}
    >
      {/* Decorations aligned to wall bottom */}
      {decos.map((type, i) => (
        <div key={i} className="flex-shrink-0" style={{ alignSelf: "flex-end" }}>
          <DecoElement type={type} />
        </div>
      ))}

      {/* Room label pinned top-right */}
      <div
        className="absolute top-2 right-3 flex items-center gap-2"
        style={{
          background: "rgba(120,105,90,0.15)",
          border: "1px solid rgba(120,105,90,0.3)",
          padding: "2px 8px",
        }}
      >
        <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-amber-800">
          {label}
        </span>
        <span className="font-mono text-[9px] text-stone-500">
          {agentCount} agent{agentCount !== 1 ? "s" : ""}
        </span>
      </div>
    </div>
  );
}

// ─── Floor row ────────────────────────────────────────────────────────────────
function FloorRow({
  label,
  agentCount,
  roomIndex,
  children,
}: {
  label: string;
  agentCount: number;
  roomIndex: number;
  children: React.ReactNode;
}) {
  return (
    <div>
      <BackWall label={label} agentCount={agentCount} roomIndex={roomIndex} />

      {/* Agent desk area — tile floor */}
      <div
        className="flex flex-wrap items-end gap-6 px-8 pt-5 pb-0 min-h-36"
        style={{
          ...tileBg,
          borderBottom: "2px solid rgba(0,0,0,0.15)",
        }}
      >
        {children}
        {/* Floor strip at bottom */}
        <div className="w-full" style={{ height: 12, background: "rgba(0,0,0,0.08)", marginTop: 4 }} />
      </div>

      {/* Room divider */}
      <div style={{ height: 6, background: "#6b6560" }} />
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export function AgentOfficeFloor({ agents, tasks, boardName, boardsById }: AgentOfficeFloorProps) {
  const router = useRouter();

  const currentTaskByAgentId = useMemo(() => {
    const map: Record<string, TaskCardRead> = {};
    for (const task of tasks) {
      if (task.assigned_agent_id && task.status === TaskCardReadStatus.in_progress) {
        map[task.assigned_agent_id] = task;
      }
    }
    return map;
  }, [tasks]);

  const sortedAgents = useMemo(() => {
    return [...agents].sort((a, b) => {
      if (a.agent_role === "manager" && b.agent_role !== "manager") return -1;
      if (a.agent_role !== "manager" && b.agent_role === "manager") return 1;
      return (a.name ?? "").localeCompare(b.name ?? "");
    });
  }, [agents]);

  const groupedByBoard = useMemo(() => {
    const groups: Record<string, AgentRead[]> = {};
    for (const agent of sortedAgents) {
      const key = agent.board_id ?? "unassigned";
      if (!groups[key]) groups[key] = [];
      groups[key].push(agent);
    }
    return groups;
  }, [sortedAgents]);

  if (agents.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-64" style={tileBg}>
        <p
          className="font-mono text-sm text-center px-6 py-3"
          style={{
            color: "#78716c",
            background: "rgba(255,255,255,0.6)",
            border: "2px solid #c4bfb8",
          }}
        >
          [ EMPTY OFFICE ]
        </p>
      </div>
    );
  }

  if (boardName !== undefined) {
    return (
      <div>
        <FloorRow label={boardName} agentCount={sortedAgents.length} roomIndex={0}>
          {sortedAgents.map((agent) => (
            <AgentDeskTile
              key={agent.id}
              agent={agent}
              currentTask={currentTaskByAgentId[agent.id ?? ""] ?? null}
              onClick={() => router.push(`/agents/${agent.id}`)}
            />
          ))}
        </FloorRow>
      </div>
    );
  }

  return (
    <div>
      {Object.entries(groupedByBoard).map(([boardId, boardAgents], idx) => {
        const roomName =
          boardsById?.[boardId] ??
          (boardId === "unassigned" ? "Unassigned" : boardId.slice(0, 8));
        return (
          <FloorRow
            key={boardId}
            label={roomName}
            agentCount={boardAgents.length}
            roomIndex={idx}
          >
            {boardAgents.map((agent) => (
              <AgentDeskTile
                key={agent.id}
                agent={agent}
                currentTask={currentTaskByAgentId[agent.id ?? ""] ?? null}
                onClick={() => router.push(`/agents/${agent.id}`)}
              />
            ))}
          </FloorRow>
        );
      })}
    </div>
  );
}
