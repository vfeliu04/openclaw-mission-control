"use client";

import { AgentRead } from "@/api/generated/model/agentRead";
import { AgentPixelSprite } from "@/components/organisms/AgentPixelSprite";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface AgentDeskTileProps {
  agent: AgentRead;
  currentTask?: { title: string; difficulty?: string } | null;
  onClick?: () => void;
}

function formatRelativeTime(dateStr: string | null | undefined): string {
  if (!dateStr) return "never";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function MonitorPixel({ active }: { active: boolean }) {
  const screenColor = active ? "#1d4ed8" : "#0f172a";
  return (
    <svg
      viewBox="0 0 16 14"
      width={32}
      height={28}
      style={{ imageRendering: "pixelated" }}
    >
      {/* Bezel */}
      <rect x="0" y="0" width="16" height="10" fill="#374151" />
      {/* Screen */}
      <rect x="1" y="1" width="14" height="8" fill={screenColor} />
      {/* Screen content lines (when active) */}
      {active && (
        <>
          <rect x="2" y="3" width="10" height="1" fill="#60a5fa" />
          <rect x="2" y="5" width="7" height="1" fill="#60a5fa" />
          <rect x="2" y="7" width="4" height="1" fill="#34d399" />
        </>
      )}
      {/* Idle screen dot */}
      {!active && <rect x="7" y="4" width="2" height="2" fill="#1e293b" />}
      {/* Stand */}
      <rect x="7" y="10" width="2" height="2" fill="#4b5563" />
      {/* Base */}
      <rect x="4" y="12" width="8" height="2" fill="#4b5563" />
    </svg>
  );
}

const SKILL_BODY_COLORS: Record<string, string> = {
  cybersecurity: "#ef4444",
  data:          "#22c55e",
  frontend:      "#818cf8",
  devops:        "#f97316",
  research:      "#d946ef",
};

export function AgentDeskTile({ agent, currentTask, onClick }: AgentDeskTileProps) {
  const state: "idle" | "working" | "offline" =
    agent.status === "offline" || agent.status === "provisioning"
      ? "offline"
      : currentTask
      ? "working"
      : "idle";

  const isManager = agent.agent_role === "manager";
  const skillTags = (agent.skill_tags as string[] | undefined) ?? [];

  const accentColor = isManager
    ? "#f59e0b"
    : (skillTags[0] ? SKILL_BODY_COLORS[skillTags[0]] : "#3b82f6") ?? "#3b82f6";

  const statusText =
    state === "offline"
      ? "OFFLINE"
      : state === "working"
      ? (currentTask?.title ?? "working").slice(0, 14)
      : "IDLE";

  const statusColor =
    state === "working" ? "#4ade80" : state === "offline" ? "#6b7280" : "#fbbf24";

  const taskLabel =
    state === "working" && currentTask?.title
      ? currentTask.title.length > 14
        ? currentTask.title.slice(0, 13) + "…"
        : currentTask.title
      : statusText;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            onClick={onClick}
            className="flex flex-col items-center cursor-pointer group select-none"
            style={{ width: 100 }}
          >
            {/* Character + monitor on the "floor" */}
            <div className="flex items-end justify-center gap-1 px-2 pb-0">
              <AgentPixelSprite
                role={agent.agent_role ?? "specialist"}
                skillTags={skillTags}
                state={state}
                size={52}
              />
              <div className="mb-1">
                <MonitorPixel active={state === "working"} />
              </div>
            </div>

            {/* Desk surface */}
            <div
              style={{
                width: "100%",
                height: 7,
                backgroundColor: "#7c3506",
                borderTop: `3px solid ${accentColor}`,
                borderBottom: "1px solid #431d03",
              }}
            />

            {/* Name plate */}
            <div
              className="w-full text-center px-1 pt-1 pb-1.5 group-hover:brightness-125 transition-all"
              style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
            >
              <p className="text-[10px] font-mono font-bold text-white leading-tight truncate">
                {agent.name}
              </p>
              <p
                className="text-[9px] font-mono leading-tight truncate mt-0.5"
                style={{ color: statusColor }}
              >
                {taskLabel}
              </p>
            </div>
          </div>
        </TooltipTrigger>
        <TooltipContent className="font-mono text-xs bg-zinc-900 border-zinc-700">
          <div className="flex flex-col gap-1">
            <span className="font-bold text-white">{agent.name}</span>
            <span className="capitalize text-zinc-400">{agent.agent_role ?? "specialist"}</span>
            {skillTags.length > 0 && (
              <span className="text-blue-400">{skillTags.join(" · ")}</span>
            )}
            {currentTask && (
              <span className="text-emerald-400">→ {currentTask.title}</span>
            )}
            <span className="text-zinc-500">
              seen: {formatRelativeTime(agent.last_seen_at)}
            </span>
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}
