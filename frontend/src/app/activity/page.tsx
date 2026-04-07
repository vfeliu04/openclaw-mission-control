"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";

import { SignedIn, SignedOut, useAuth } from "@/auth/clerk";
import {
  Activity as ActivityIcon,
  Bot,
  CheckCircle2,
  CircleDot,
  type LucideIcon,
  MessageSquare,
  PencilLine,
  Plus,
  Radio,
  ShieldAlert,
  ShieldCheck,
  ShieldX,
  Terminal,
  Wifi,
  WifiOff,
} from "lucide-react";

import { ApiError } from "@/api/mutator";
import { streamAgentsApiV1AgentsStreamGet } from "@/api/generated/agents/agents";
import { listActivityApiV1ActivityGet } from "@/api/generated/activity/activity";
import {
  getBoardSnapshotApiV1BoardsBoardIdSnapshotGet,
  listBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import { streamBoardMemoryApiV1BoardsBoardIdMemoryStreamGet } from "@/api/generated/board-memory/board-memory";
import { streamApprovalsApiV1BoardsBoardIdApprovalsStreamGet } from "@/api/generated/approvals/approvals";
import { streamTasksApiV1BoardsBoardIdTasksStreamGet } from "@/api/generated/tasks/tasks";
import {
  type getMyMembershipApiV1OrganizationsMeMemberGetResponse,
  useGetMyMembershipApiV1OrganizationsMeMemberGet,
} from "@/api/generated/organizations/organizations";
import type {
  ActivityEventRead,
  AgentRead,
  ApprovalRead,
  BoardMemoryRead,
  BoardRead,
  TaskCommentRead,
  TaskRead,
} from "@/api/generated/model";
import { Markdown } from "@/components/atoms/Markdown";
import { SignedOutPanel } from "@/components/auth/SignedOutPanel";
import { DashboardSidebar } from "@/components/organisms/DashboardSidebar";
import { DashboardShell } from "@/components/templates/DashboardShell";
import { createExponentialBackoff } from "@/lib/backoff";
import {
  DEFAULT_HUMAN_LABEL,
  resolveHumanActorName,
  resolveMemberDisplayName,
} from "@/lib/display-name";
import { apiDatetimeToMs, parseApiDatetime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { usePageActive } from "@/hooks/usePageActive";

export const dynamic = "force-dynamic";

// ─── Constants ───────────────────────────────────────────────────────────────

const SSE_RECONNECT_BACKOFF = {
  baseMs: 1_000,
  factor: 2,
  jitter: 0.2,
  maxMs: 5 * 60_000,
} as const;

const STREAM_CONNECT_SPACING_MS = 120;
const MAX_FEED_ITEMS = 300;
const PAGED_LIMIT = 200;
const PAGED_MAX = 1000;

// ─── Types ────────────────────────────────────────────────────────────────────

type Agent = AgentRead & { status: string };

type AgentTaskInfo = {
  title: string;
  boardName: string | null;
  eventType: string;
  updatedAt: string;
};

type TaskEventType =
  | "task.comment"
  | "task.created"
  | "task.updated"
  | "task.status_changed";

type FeedEventType =
  | TaskEventType
  | "board.chat"
  | "board.command"
  | "agent.created"
  | "agent.online"
  | "agent.offline"
  | "agent.updated"
  | "approval.created"
  | "approval.updated"
  | "approval.approved"
  | "approval.rejected";

type FeedItem = {
  id: string;
  created_at: string;
  event_type: FeedEventType;
  message: string | null;
  source_event_id: string | null;
  agent_id: string | null;
  actor_name: string;
  actor_role: string | null;
  board_id: string | null;
  board_name: string | null;
  board_href: string | null;
  task_id: string | null;
  task_title: string | null;
  title: string;
  context_href: string | null;
};

type TaskMeta = {
  title: string;
  boardId: string | null;
};

type ActivityRouteParams = Record<string, string>;

// ─── Helpers ──────────────────────────────────────────────────────────────────

const ACTIVITY_FEED_PATH = "/activity";

const TASK_EVENT_TYPES = new Set<TaskEventType>([
  "task.comment",
  "task.created",
  "task.updated",
  "task.status_changed",
]);

const isTaskEventType = (value: string): value is TaskEventType =>
  TASK_EVENT_TYPES.has(value as TaskEventType);

const formatShortTimestamp = (value: string) => {
  const date = parseApiDatetime(value);
  if (!date) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

const formatRelativeTime = (value: string): string => {
  const date = parseApiDatetime(value);
  if (!date) return "—";
  const diffMs = Date.now() - date.getTime();
  const diffSecs = Math.floor(diffMs / 1000);
  if (diffSecs < 60) return "just now";
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `${diffMins} minute${diffMins === 1 ? "" : "s"} ago`;
  const diffHours = Math.floor(diffMins / 60);
  if (diffHours < 24) return `${diffHours} hour${diffHours === 1 ? "" : "s"} ago`;
  const diffDays = Math.floor(diffHours / 24);
  if (diffDays === 1) return "yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;
  return formatShortTimestamp(value);
};

// ─── Time-grouping helpers ────────────────────────────────────────────────────

type TimeGroup = "morning" | "afternoon" | "yesterday" | "older";

const getTimeGroup = (value: string): TimeGroup => {
  const date = parseApiDatetime(value);
  if (!date) return "older";
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const yesterdayStart = new Date(todayStart.getTime() - 86_400_000);
  const noonToday = new Date(
    now.getFullYear(),
    now.getMonth(),
    now.getDate(),
    12,
    0,
    0,
  );
  if (date >= noonToday) return "afternoon";
  if (date >= todayStart) return "morning";
  if (date >= yesterdayStart) return "yesterday";
  return "older";
};

const TIME_GROUP_LABELS: Record<TimeGroup, string> = {
  morning: "This morning",
  afternoon: "This afternoon",
  yesterday: "Yesterday",
  older: "Earlier",
};

const TIME_GROUP_ORDER: TimeGroup[] = [
  "afternoon",
  "morning",
  "yesterday",
  "older",
];

const groupFeedItems = (
  items: FeedItem[],
): { group: TimeGroup; label: string; items: FeedItem[] }[] => {
  const map = new Map<TimeGroup, FeedItem[]>();
  for (const item of items) {
    const group = getTimeGroup(item.created_at);
    const existing = map.get(group);
    if (existing) {
      existing.push(item);
    } else {
      map.set(group, [item]);
    }
  }
  return TIME_GROUP_ORDER.filter((g) => map.has(g)).map((g) => ({
    group: g,
    label: TIME_GROUP_LABELS[g],
    items: map.get(g)!,
  }));
};

const normalizeRouteParams = (
  params: ActivityEventRead["route_params"] | ActivityRouteParams | null | undefined,
): ActivityRouteParams => {
  if (!params || typeof params !== "object") return {};
  return Object.entries(params).reduce<ActivityRouteParams>((acc, [key, value]) => {
    if (typeof value === "string" && value.length > 0) {
      acc[key] = value;
    }
    return acc;
  }, {});
};

const buildRouteHref = (
  routeName: string | null | undefined,
  routeParams: ActivityRouteParams,
  fallback: {
    eventId: string;
    eventType: string;
    createdAt: string;
    taskId: string | null;
  },
): string => {
  if (routeName === "board.approvals") {
    const boardId = routeParams.boardId;
    if (boardId) {
      return `/boards/${encodeURIComponent(boardId)}/approvals`;
    }
  }

  if (routeName === "board") {
    const boardId = routeParams.boardId;
    if (boardId) {
      const params = new URLSearchParams();
      Object.entries(routeParams).forEach(([key, value]) => {
        if (key !== "boardId") params.set(key, value);
      });
      const query = params.toString();
      return query
        ? `/boards/${encodeURIComponent(boardId)}?${query}`
        : `/boards/${encodeURIComponent(boardId)}`;
    }
  }

  const params = new URLSearchParams(
    Object.keys(routeParams).length > 0
      ? routeParams
      : {
          eventId: fallback.eventId,
          eventType: fallback.eventType,
          createdAt: fallback.createdAt,
        },
  );
  if (fallback.taskId && !params.has("taskId")) {
    params.set("taskId", fallback.taskId);
  }
  return `${ACTIVITY_FEED_PATH}?${params.toString()}`;
};

const buildBoardHref = (
  routeParams: ActivityRouteParams,
  boardId: string | null,
): string | null => {
  const resolved = routeParams.boardId ?? boardId;
  if (!resolved) return null;
  return `/boards/${encodeURIComponent(resolved)}`;
};

const feedItemElementId = (id: string): string =>
  `activity-item-${id.replace(/[^a-zA-Z0-9_-]/g, "-")}`;

const normalizeAgent = (agent: AgentRead): Agent => ({
  ...agent,
  status: (agent.status ?? "offline").trim() || "offline",
});

const normalizeStatus = (value?: string | null) =>
  (value ?? "").trim().toLowerCase() || "offline";

const humanizeApprovalAction = (value: string): string => {
  const cleaned = value.replace(/[._-]+/g, " ").trim();
  if (!cleaned) return "Approval";
  return cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
};

const humanizeStatus = (value: string): string =>
  value.replace(/_/g, " ").trim() || "offline";

const roleFromAgent = (agent?: Agent | null): string | null => {
  if (!agent) return null;
  const profile = agent.identity_profile;
  if (!profile || typeof profile !== "object") return null;
  const role = (profile as Record<string, unknown>).role;
  if (typeof role !== "string") return null;
  const trimmed = role.trim();
  return trimmed || null;
};

const eventLabel = (eventType: FeedEventType): string => {
  if (eventType === "task.comment") return "Comment";
  if (eventType === "task.created") return "Created";
  if (eventType === "task.status_changed") return "Status";
  if (eventType === "board.chat") return "Chat";
  if (eventType === "board.command") return "Command";
  if (eventType === "agent.created") return "Agent";
  if (eventType === "agent.online") return "Online";
  if (eventType === "agent.offline") return "Offline";
  if (eventType === "agent.updated") return "Agent update";
  if (eventType === "approval.created") return "Approval";
  if (eventType === "approval.updated") return "Approval update";
  if (eventType === "approval.approved") return "Approved";
  if (eventType === "approval.rejected") return "Rejected";
  return "Updated";
};

const eventPillClass = (eventType: FeedEventType): string => {
  if (eventType === "task.comment") return "border-blue-200 bg-blue-50 text-blue-700";
  if (eventType === "task.created") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (eventType === "task.status_changed") return "border-amber-200 bg-amber-50 text-amber-700";
  if (eventType === "board.chat") return "border-teal-200 bg-teal-50 text-teal-700";
  if (eventType === "board.command") return "border-fuchsia-200 bg-fuchsia-50 text-fuchsia-700";
  if (eventType === "agent.created") return "border-violet-200 bg-violet-50 text-violet-700";
  if (eventType === "agent.online") return "border-lime-200 bg-lime-50 text-lime-700";
  if (eventType === "agent.offline") return "border-slate-300 bg-slate-100 text-slate-700";
  if (eventType === "agent.updated") return "border-indigo-200 bg-indigo-50 text-indigo-700";
  if (eventType === "approval.created") return "border-cyan-200 bg-cyan-50 text-cyan-700";
  if (eventType === "approval.updated") return "border-sky-200 bg-sky-50 text-sky-700";
  if (eventType === "approval.approved") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (eventType === "approval.rejected") return "border-rose-200 bg-rose-50 text-rose-700";
  return "border-slate-200 bg-slate-100 text-slate-700";
};

const eventIcon = (eventType: FeedEventType): LucideIcon => {
  if (eventType === "task.comment") return MessageSquare;
  if (eventType === "task.created") return Plus;
  if (eventType === "task.status_changed") return CircleDot;
  if (eventType === "task.updated") return PencilLine;
  if (eventType === "board.chat") return MessageSquare;
  if (eventType === "board.command") return Terminal;
  if (eventType === "agent.created") return Bot;
  if (eventType === "agent.online") return Wifi;
  if (eventType === "agent.offline") return WifiOff;
  if (eventType === "agent.updated") return Bot;
  if (eventType === "approval.created") return ShieldAlert;
  if (eventType === "approval.updated") return ShieldAlert;
  if (eventType === "approval.approved") return ShieldCheck;
  if (eventType === "approval.rejected") return ShieldX;
  return CheckCircle2;
};

const eventIconBg = (eventType: FeedEventType): string => {
  if (eventType === "task.comment") return "bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-400";
  if (eventType === "task.created") return "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";
  if (eventType === "task.status_changed") return "bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-400";
  if (eventType === "task.updated") return "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400";
  if (eventType === "board.chat") return "bg-teal-100 text-teal-600 dark:bg-teal-900/40 dark:text-teal-400";
  if (eventType === "board.command") return "bg-fuchsia-100 text-fuchsia-600 dark:bg-fuchsia-900/40 dark:text-fuchsia-400";
  if (eventType === "agent.created") return "bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-400";
  if (eventType === "agent.online") return "bg-lime-100 text-lime-600 dark:bg-lime-900/40 dark:text-lime-400";
  if (eventType === "agent.offline") return "bg-slate-100 text-slate-500 dark:bg-zinc-800 dark:text-zinc-500";
  if (eventType === "agent.updated") return "bg-indigo-100 text-indigo-600 dark:bg-indigo-900/40 dark:text-indigo-400";
  if (eventType === "approval.created") return "bg-cyan-100 text-cyan-600 dark:bg-cyan-900/40 dark:text-cyan-400";
  if (eventType === "approval.updated") return "bg-sky-100 text-sky-600 dark:bg-sky-900/40 dark:text-sky-400";
  if (eventType === "approval.approved") return "bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-400";
  if (eventType === "approval.rejected") return "bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-400";
  return "bg-slate-100 text-slate-600 dark:bg-zinc-800 dark:text-zinc-400";
};

const buildPlainEnglish = (item: FeedItem): string => {
  const actor = item.actor_name;
  const taskTitle = item.task_title ?? item.title;
  const boardName = item.board_name;
  const boardSuffix = boardName ? ` on ${boardName}` : "";

  switch (item.event_type) {
    case "task.comment":
      return `${actor} commented on "${taskTitle}"${boardSuffix}`;
    case "task.created":
      return `${actor} created task "${taskTitle}"${boardSuffix}`;
    case "task.updated":
      return `${actor} updated task "${taskTitle}"${boardSuffix}`;
    case "task.status_changed":
      return `${actor} changed status of "${taskTitle}"${boardSuffix}`;
    case "board.chat":
      return `${actor} sent a message${boardSuffix}`;
    case "board.command":
      return `${actor} ran a command${boardSuffix}`;
    case "agent.created":
      return `Agent ${actor} was registered${boardName ? ` on ${boardName}` : ""}`;
    case "agent.online":
      return `Agent ${actor} came online${boardName ? ` on ${boardName}` : ""}`;
    case "agent.offline":
      return `Agent ${actor} went offline${boardName ? ` on ${boardName}` : ""}`;
    case "agent.updated":
      return `Agent ${actor} was updated${boardName ? ` on ${boardName}` : ""}`;
    case "approval.created":
      return `${actor} requested an approval${boardSuffix}`;
    case "approval.updated":
      return `Approval updated by ${actor}${boardSuffix}`;
    case "approval.approved":
      return `${actor} approved a request${boardSuffix}`;
    case "approval.rejected":
      return `${actor} rejected a request${boardSuffix}`;
    default:
      return item.title;
  }
};

// ─── Agent Card ───────────────────────────────────────────────────────────────

const AgentCard = memo(function AgentCard({
  agent,
  taskInfo,
  isLead,
}: {
  agent: Agent;
  taskInfo?: AgentTaskInfo;
  isLead?: boolean;
}) {
  const status = normalizeStatus(agent.status);
  const isOnline = status === "online";
  const role = roleFromAgent(agent);
  const avatar = (agent.name[0] ?? "A").toUpperCase();
  const boardHref = agent.board_id
    ? `/boards/${encodeURIComponent(agent.board_id)}`
    : null;

  const taskVerb =
    taskInfo?.eventType === "task.comment"
      ? "Commented on"
      : taskInfo?.eventType === "task.created"
        ? "Created"
        : taskInfo?.eventType === "task.status_changed"
          ? "Updated status of"
          : "Working on";

  return (
    <div
      className={cn(
        "relative flex flex-col rounded-xl border bg-white p-4 shadow-sm transition duration-200",
        isLead
          ? "border-blue-200 ring-1 ring-blue-100 shadow-blue-50"
          : "border-slate-200 hover:border-slate-300",
      )}
    >
      {/* Live status indicator */}
      <div className="absolute right-3 top-3 flex items-center gap-1.5">
        <span className="relative flex h-2 w-2">
          {isOnline && (
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
          )}
          <span
            className={cn(
              "relative inline-flex h-2 w-2 rounded-full",
              isOnline ? "bg-emerald-500" : "bg-slate-300",
            )}
          />
        </span>
        <span
          className={cn(
            "text-[10px] font-semibold uppercase tracking-wide",
            isOnline ? "text-emerald-600" : "text-slate-400",
          )}
        >
          {isOnline ? "Online" : "Offline"}
        </span>
      </div>

      {/* Avatar + name */}
      <div className="flex items-start gap-3 pr-20">
        <div
          className={cn(
            "flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-sm font-bold",
            isLead
              ? "bg-blue-100 text-blue-700"
              : isOnline
                ? "bg-emerald-100 text-emerald-700"
                : "bg-slate-100 text-slate-500",
          )}
        >
          {avatar}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <p className="truncate text-sm font-semibold text-slate-900">
              {agent.name}
            </p>
            {isLead && (
              <span className="rounded-full bg-blue-100 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wider text-blue-700">
                Lead
              </span>
            )}
          </div>
          {role ? (
            <p className="mt-0.5 truncate text-[11px] text-slate-500">{role}</p>
          ) : null}
        </div>
      </div>

      {/* Current task */}
      <div className="mt-3 min-h-[52px] rounded-lg bg-slate-50 px-3 py-2">
        {taskInfo ? (
          <>
            <p className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-slate-400">
              {taskVerb}
            </p>
            <p className="line-clamp-2 text-xs font-medium text-slate-700">
              {taskInfo.title}
            </p>
            {taskInfo.boardName ? (
              <p className="mt-0.5 text-[10px] text-slate-400">
                {taskInfo.boardName}
              </p>
            ) : null}
          </>
        ) : (
          <p className="flex h-full items-center text-xs italic text-slate-400">
            No recent task activity
          </p>
        )}
      </div>

      {/* Footer */}
      <div className="mt-2 flex items-center justify-between gap-2">
        {agent.last_seen_at ? (
          <span className="text-[10px] text-slate-400">
            {formatRelativeTime(agent.last_seen_at)}
          </span>
        ) : (
          <span />
        )}
        {boardHref ? (
          <Link
            href={boardHref}
            className="text-[10px] font-medium text-slate-500 hover:text-slate-900 hover:underline"
          >
            View board →
          </Link>
        ) : null}
      </div>
    </div>
  );
});

AgentCard.displayName = "AgentCard";

// ─── Agent Topology Panel ─────────────────────────────────────────────────────

const AgentTopologyPanel = memo(function AgentTopologyPanel({
  agents,
  agentTaskMap,
}: {
  agents: Agent[];
  agentTaskMap: Map<string, AgentTaskInfo>;
}) {
  const leadAgents = useMemo(
    () => agents.filter((a) => a.is_board_lead || a.is_gateway_main),
    [agents],
  );
  const workerAgents = useMemo(
    () => agents.filter((a) => !a.is_board_lead && !a.is_gateway_main),
    [agents],
  );
  const onlineCount = useMemo(
    () => agents.filter((a) => normalizeStatus(a.status) === "online").length,
    [agents],
  );

  if (agents.length === 0) {
    return (
      <div className="mb-6 rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-2 text-slate-400">
          <Bot className="h-4 w-4" />
          <p className="text-sm">No agents registered yet.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="mb-6 rounded-xl border border-slate-200 bg-white shadow-sm">
      {/* Panel header */}
      <div className="flex items-center justify-between border-b border-slate-100 px-5 py-3">
        <div className="flex items-center gap-2">
          <Bot className="h-4 w-4 text-slate-500" />
          <span className="text-sm font-semibold text-slate-700">
            Agent topology
          </span>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">
            {agents.length} agent{agents.length !== 1 ? "s" : ""}
          </span>
        </div>
        {onlineCount > 0 ? (
          <div className="flex items-center gap-1.5">
            <span className="relative flex h-1.5 w-1.5">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
            </span>
            <span className="text-[11px] font-medium text-emerald-600">
              {onlineCount} online
            </span>
          </div>
        ) : null}
      </div>

      <div className="p-4">
        {/* Lead agents row */}
        {leadAgents.length > 0 ? (
          <div className="mb-4">
            <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
              Lead
            </p>
            <div
              className={cn(
                "grid gap-3",
                leadAgents.length === 1
                  ? "grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                  : "grid-cols-1 sm:grid-cols-2 lg:grid-cols-3",
              )}
            >
              {leadAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  taskInfo={agentTaskMap.get(agent.id)}
                  isLead
                />
              ))}
            </div>
          </div>
        ) : null}

        {/* Worker agents grid */}
        {workerAgents.length > 0 ? (
          <div>
            {leadAgents.length > 0 ? (
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-widest text-slate-400">
                Workers
              </p>
            ) : null}
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
              {workerAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  taskInfo={agentTaskMap.get(agent.id)}
                />
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
});

AgentTopologyPanel.displayName = "AgentTopologyPanel";

// ─── Feed Card ────────────────────────────────────────────────────────────────

const FeedCard = memo(function FeedCard({
  item,
  isHighlighted = false,
}: {
  item: FeedItem;
  isHighlighted?: boolean;
}) {
  const message = (item.message ?? "").trim();
  const Icon = eventIcon(item.event_type);
  const iconBg = eventIconBg(item.event_type);
  const description = buildPlainEnglish(item);
  const relativeTime = formatRelativeTime(item.created_at);

  return (
    <div
      id={feedItemElementId(item.id)}
      className={cn(
        "scroll-mt-28 flex items-start gap-3 rounded-xl border bg-white px-4 py-3 transition duration-200 dark:bg-zinc-900",
        isHighlighted
          ? "border-blue-300 ring-2 ring-blue-200 dark:border-blue-700 dark:ring-blue-900"
          : "border-slate-200 hover:border-slate-300 dark:border-zinc-800 dark:hover:border-zinc-700",
      )}
    >
      {/* Icon */}
      <div
        className={cn(
          "mt-0.5 flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg",
          iconBg,
        )}
      >
        <Icon className="h-4 w-4" />
      </div>

      {/* Body */}
      <div className="min-w-0 flex-1">
        {/* Description line */}
        <div className="flex items-start justify-between gap-3">
          <p className="text-sm text-slate-700 dark:text-zinc-300 leading-snug">
            {item.context_href ? (
              <Link
                href={item.context_href}
                className="hover:underline hover:text-slate-900 dark:hover:text-zinc-100"
              >
                {description}
              </Link>
            ) : (
              description
            )}
          </p>
          <span className="shrink-0 text-xs text-slate-400 dark:text-zinc-600 whitespace-nowrap">
            {relativeTime}
          </span>
        </div>

        {/* Message body (chat / command / comment content) */}
        {message ? (
          <div className="mt-2 rounded-md bg-slate-50 dark:bg-zinc-800 px-3 py-2 text-sm text-slate-600 dark:text-zinc-400 leading-relaxed select-text cursor-text break-words">
            <Markdown content={message} variant="basic" />
          </div>
        ) : null}
      </div>
    </div>
  );
});

FeedCard.displayName = "FeedCard";

// ─── Time-grouped feed ────────────────────────────────────────────────────────

const TimeGroupedFeed = memo(function TimeGroupedFeed({
  isLoading,
  errorMessage,
  items,
  highlightedId,
}: {
  isLoading: boolean;
  errorMessage: string | null;
  items: FeedItem[];
  highlightedId: string | null;
}) {
  if (isLoading && items.length === 0) {
    return (
      <p className="text-sm text-slate-500 dark:text-zinc-500">
        Loading feed…
      </p>
    );
  }

  if (errorMessage) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 text-sm text-slate-700 dark:text-zinc-300 shadow-sm">
        {errorMessage}
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-10 text-center shadow-sm">
        <p className="text-sm font-medium text-slate-900 dark:text-zinc-100">
          No activity yet — agents are idle
        </p>
        <p className="mt-1 text-sm text-slate-500 dark:text-zinc-500">
          When updates happen, they will show up here.
        </p>
      </div>
    );
  }

  const groups = groupFeedItems(items);

  return (
    <div className="space-y-6">
      {groups.map(({ group, label, items: groupItems }) => (
        <section key={group}>
          <h3 className="sticky top-0 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-600 bg-[var(--bg)]">
            {label}
          </h3>
          <div className="mt-1 space-y-2">
            {groupItems.map((item) => (
              <FeedCard
                key={item.id}
                item={item}
                isHighlighted={highlightedId === item.id}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
});

TimeGroupedFeed.displayName = "TimeGroupedFeed";

// ─── Page ─────────────────────────────────────────────────────────────────────

export default function ActivityPage() {
  const [isMounted, setIsMounted] = useState(false);
  useEffect(() => {
    setIsMounted(true);
  }, []);

  const { isSignedIn } = useAuth();
  const searchParams = useSearchParams();
  const isPageActive = usePageActive();

  const selectedEventId = useMemo(() => {
    const value = searchParams.get("eventId");
    if (!value) return null;
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }, [searchParams]);

  const [highlightedFeedItemId, setHighlightedFeedItemId] = useState<
    string | null
  >(null);

  const membershipQuery = useGetMyMembershipApiV1OrganizationsMeMemberGet<
    getMyMembershipApiV1OrganizationsMeMemberGetResponse,
    ApiError
  >({
    query: {
      enabled: Boolean(isSignedIn),
      refetchOnMount: "always",
      refetchOnWindowFocus: false,
      retry: false,
    },
  });

  const isOrgAdmin = useMemo(() => {
    const member =
      membershipQuery.data?.status === 200 ? membershipQuery.data.data : null;
    return member ? ["owner", "admin"].includes(member.role) : false;
  }, [membershipQuery.data]);

  const currentUserDisplayName = useMemo(() => {
    const member =
      membershipQuery.data?.status === 200 ? membershipQuery.data.data : null;
    return resolveMemberDisplayName(member, DEFAULT_HUMAN_LABEL);
  }, [membershipQuery.data]);

  // ── Feed state ──────────────────────────────────────────────────────────────

  const [isFeedLoading, setIsFeedLoading] = useState(false);
  const [feedError, setFeedError] = useState<string | null>(null);
  const [feedItems, setFeedItems] = useState<FeedItem[]>([]);
  const [boards, setBoards] = useState<BoardRead[]>([]);

  // ── Agent topology state ────────────────────────────────────────────────────

  const [agentsState, setAgentsState] = useState<Agent[]>([]);
  const agentLatestTaskRef = useRef<Map<string, AgentTaskInfo>>(new Map());
  const [agentTaskMap, setAgentTaskMap] = useState<Map<string, AgentTaskInfo>>(
    new Map(),
  );

  // ── Refs ────────────────────────────────────────────────────────────────────

  const feedItemsRef = useRef<FeedItem[]>([]);
  const seenIdsRef = useRef<Set<string>>(new Set());
  const boardsByIdRef = useRef<Map<string, BoardRead>>(new Map());
  const taskMetaByIdRef = useRef<Map<string, TaskMeta>>(new Map());
  const agentsByIdRef = useRef<Map<string, Agent>>(new Map());
  const approvalsByIdRef = useRef<Map<string, ApprovalRead>>(new Map());

  useEffect(() => {
    feedItemsRef.current = feedItems;
  }, [feedItems]);

  const boardIds = useMemo(() => boards.map((board) => board.id), [boards]);

  // ── Callbacks ───────────────────────────────────────────────────────────────

  const pushFeedItem = useCallback((item: FeedItem) => {
    setFeedItems((prev) => {
      if (seenIdsRef.current.has(item.id)) return prev;
      seenIdsRef.current.add(item.id);
      const next = [item, ...prev];
      return next.slice(0, MAX_FEED_ITEMS);
    });
  }, []);

  const resolveAuthor = useCallback(
    (
      agentId: string | null | undefined,
      fallbackName: string = currentUserDisplayName,
    ) => {
      if (agentId) {
        const agent = agentsByIdRef.current.get(agentId);
        if (agent) {
          return { id: agent.id, name: agent.name, role: roleFromAgent(agent) };
        }
      }
      return { id: agentId ?? null, name: fallbackName, role: null };
    },
    [currentUserDisplayName],
  );

  const boardNameForId = useCallback((boardId: string | null | undefined) => {
    if (!boardId) return null;
    return boardsByIdRef.current.get(boardId)?.name ?? null;
  }, []);

  const updateTaskMeta = useCallback(
    (
      task: { id: string; title: string; board_id?: string | null },
      fallbackBoardId: string,
    ) => {
      const boardId = task.board_id ?? fallbackBoardId;
      taskMetaByIdRef.current.set(task.id, { title: task.title, boardId });
    },
    [],
  );

  const updateAgentTask = useCallback(
    (agentId: string, info: AgentTaskInfo) => {
      agentLatestTaskRef.current.set(agentId, info);
      setAgentTaskMap(new Map(agentLatestTaskRef.current));
    },
    [],
  );

  const mapTaskActivity = useCallback(
    (
      event: ActivityEventRead,
      fallbackBoardId: string | null = null,
    ): FeedItem | null => {
      if (!isTaskEventType(event.event_type)) return null;
      const meta = event.task_id
        ? taskMetaByIdRef.current.get(event.task_id)
        : null;
      const routeName = event.route_name ?? null;
      const routeParams = normalizeRouteParams(event.route_params);
      const taskId = event.task_id ?? routeParams.taskId ?? null;
      const boardId =
        meta?.boardId ??
        event.board_id ??
        routeParams.boardId ??
        fallbackBoardId ??
        null;
      const fallbackRouteParams: ActivityRouteParams = {};
      if (boardId) fallbackRouteParams.boardId = boardId;
      if (taskId) fallbackRouteParams.taskId = taskId;
      const effectiveRouteParams =
        Object.keys(routeParams).length > 0 ? routeParams : fallbackRouteParams;
      const effectiveRouteName =
        routeName ?? (boardId ? "board" : "activity");
      const author = resolveAuthor(event.agent_id, currentUserDisplayName);
      return {
        id: `activity:${event.id}`,
        created_at: event.created_at,
        event_type: event.event_type,
        message: event.message ?? null,
        source_event_id: event.id,
        agent_id: author.id,
        actor_name: author.name,
        actor_role: author.role,
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(effectiveRouteParams, boardId),
        task_id: taskId,
        task_title: meta?.title ?? null,
        title: meta?.title ?? (taskId ? "Unknown task" : "Task activity"),
        context_href: buildRouteHref(
          effectiveRouteName,
          effectiveRouteParams,
          {
            eventId: event.id,
            eventType: event.event_type,
            createdAt: event.created_at,
            taskId,
          },
        ),
      };
    },
    [boardNameForId, currentUserDisplayName, resolveAuthor],
  );

  const mapTaskComment = useCallback(
    (comment: TaskCommentRead, fallbackBoardId: string): FeedItem => {
      const meta = comment.task_id
        ? taskMetaByIdRef.current.get(comment.task_id)
        : null;
      const boardId = meta?.boardId ?? fallbackBoardId;
      const taskId = comment.task_id ?? null;
      const routeParams: ActivityRouteParams = {};
      if (boardId) routeParams.boardId = boardId;
      if (taskId) routeParams.taskId = taskId;
      routeParams.commentId = comment.id;
      const author = resolveAuthor(comment.agent_id, currentUserDisplayName);
      return {
        id: `comment:${comment.id}`,
        created_at: comment.created_at,
        event_type: "task.comment",
        message: comment.message ?? null,
        source_event_id: null,
        agent_id: author.id,
        actor_name: author.name,
        actor_role: author.role,
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(routeParams, boardId),
        task_id: taskId,
        task_title: meta?.title ?? null,
        title: meta?.title ?? (taskId ? "Unknown task" : "Task activity"),
        context_href: buildRouteHref("board", routeParams, {
          eventId: comment.id,
          eventType: "task.comment",
          createdAt: comment.created_at,
          taskId,
        }),
      };
    },
    [boardNameForId, currentUserDisplayName, resolveAuthor],
  );

  const mapApprovalEvent = useCallback(
    (
      approval: ApprovalRead,
      boardId: string,
      previous: ApprovalRead | null = null,
    ): FeedItem => {
      const nextStatus = approval.status ?? "pending";
      const previousStatus = previous?.status ?? null;
      const kind: FeedEventType =
        previousStatus === null
          ? nextStatus === "approved"
            ? "approval.approved"
            : nextStatus === "rejected"
              ? "approval.rejected"
              : "approval.created"
          : nextStatus !== previousStatus
            ? nextStatus === "approved"
              ? "approval.approved"
              : nextStatus === "rejected"
                ? "approval.rejected"
                : "approval.updated"
            : "approval.updated";

      const stamp =
        kind === "approval.created"
          ? approval.created_at
          : (approval.resolved_at ?? approval.created_at);
      const action = humanizeApprovalAction(approval.action_type);
      const author = resolveAuthor(approval.agent_id, currentUserDisplayName);
      const statusText =
        nextStatus === "approved"
          ? "approved"
          : nextStatus === "rejected"
            ? "rejected"
            : "pending";
      const message =
        kind === "approval.created"
          ? `${action} requested (${approval.confidence}% confidence).`
          : kind === "approval.approved"
            ? `${action} approved (${approval.confidence}% confidence).`
            : kind === "approval.rejected"
              ? `${action} rejected (${approval.confidence}% confidence).`
              : `${action} updated (${statusText}, ${approval.confidence}% confidence).`;

      const taskMeta = approval.task_id
        ? taskMetaByIdRef.current.get(approval.task_id)
        : null;
      const routeParams: ActivityRouteParams = { boardId };
      const taskId = approval.task_id ?? null;

      return {
        id: `approval:${approval.id}:${kind}:${stamp}`,
        created_at: stamp,
        event_type: kind,
        message,
        source_event_id: null,
        agent_id: author.id,
        actor_name: author.name,
        actor_role: author.role,
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(routeParams, boardId),
        task_id: taskId,
        task_title: taskMeta?.title ?? null,
        title: `Approval · ${action}`,
        context_href: buildRouteHref("board.approvals", routeParams, {
          eventId: approval.id,
          eventType: kind,
          createdAt: stamp,
          taskId,
        }),
      };
    },
    [boardNameForId, currentUserDisplayName, resolveAuthor],
  );

  const mapBoardChat = useCallback(
    (memory: BoardMemoryRead, boardId: string): FeedItem => {
      const content = (memory.content ?? "").trim();
      const actorName = resolveHumanActorName(
        memory.source,
        currentUserDisplayName,
      );
      const command = content.startsWith("/");
      const routeParams: ActivityRouteParams = { boardId, panel: "chat" };
      return {
        id: `chat:${memory.id}`,
        created_at: memory.created_at,
        event_type: command ? "board.command" : "board.chat",
        message: content || null,
        source_event_id: null,
        agent_id: null,
        actor_name: actorName,
        actor_role: null,
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(routeParams, boardId),
        task_id: null,
        task_title: null,
        title: command ? "Board command" : "Board chat",
        context_href: buildRouteHref("board", routeParams, {
          eventId: memory.id,
          eventType: command ? "board.command" : "board.chat",
          createdAt: memory.created_at,
          taskId: null,
        }),
      };
    },
    [boardNameForId, currentUserDisplayName],
  );

  const mapAgentEvent = useCallback(
    (
      agent: Agent,
      previous: Agent | null,
      isSnapshot = false,
    ): FeedItem | null => {
      const nextStatus = normalizeStatus(agent.status);
      const previousStatus = previous ? normalizeStatus(previous.status) : null;
      const statusChanged =
        previousStatus !== null && nextStatus !== previousStatus;
      const profileChanged =
        Boolean(previous) &&
        (previous?.name !== agent.name ||
          previous?.is_board_lead !== agent.is_board_lead ||
          JSON.stringify(previous?.identity_profile ?? {}) !==
            JSON.stringify(agent.identity_profile ?? {}));

      let kind: FeedEventType;
      if (isSnapshot) {
        kind =
          nextStatus === "online"
            ? "agent.online"
            : nextStatus === "offline"
              ? "agent.offline"
              : "agent.updated";
      } else if (!previous) {
        kind = "agent.created";
      } else if (statusChanged && nextStatus === "online") {
        kind = "agent.online";
      } else if (statusChanged && nextStatus === "offline") {
        kind = "agent.offline";
      } else if (statusChanged || profileChanged) {
        kind = "agent.updated";
      } else {
        return null;
      }

      const stamp = agent.last_seen_at ?? agent.updated_at ?? agent.created_at;
      const message =
        kind === "agent.created"
          ? `${agent.name} joined this board.`
          : kind === "agent.online"
            ? `${agent.name} is online.`
            : kind === "agent.offline"
              ? `${agent.name} is offline.`
              : `${agent.name} updated (${humanizeStatus(nextStatus)}).`;
      const boardId = agent.board_id ?? null;
      const routeParams: ActivityRouteParams = boardId ? { boardId } : {};

      return {
        id: `agent:${agent.id}:${isSnapshot ? "snapshot" : kind}:${stamp}`,
        created_at: stamp,
        event_type: kind,
        message,
        source_event_id: null,
        agent_id: agent.id,
        actor_name: agent.name,
        actor_role: roleFromAgent(agent),
        board_id: boardId,
        board_name: boardNameForId(boardId),
        board_href: buildBoardHref(routeParams, boardId),
        task_id: null,
        task_title: null,
        title: `Agent · ${agent.name}`,
        context_href:
          boardId === null
            ? null
            : buildRouteHref("board", routeParams, {
                eventId: agent.id,
                eventType: kind,
                createdAt: stamp,
                taskId: null,
              }),
      };
    },
    [boardNameForId],
  );

  const latestTimestamp = useCallback(
    (predicate: (item: FeedItem) => boolean): string | null => {
      let latest = 0;
      for (const item of feedItemsRef.current) {
        if (!predicate(item)) continue;
        const time = apiDatetimeToMs(item.created_at) ?? 0;
        if (time > latest) latest = time;
      }
      return latest ? new Date(latest).toISOString() : null;
    },
    [],
  );

  // ── Effect: Initial load ────────────────────────────────────────────────────

  useEffect(() => {
    if (!isSignedIn) {
      setBoards([]);
      setFeedItems([]);
      setFeedError(null);
      setIsFeedLoading(false);
      setAgentsState([]);
      setAgentTaskMap(new Map());
      seenIdsRef.current = new Set();
      boardsByIdRef.current = new Map();
      taskMetaByIdRef.current = new Map();
      agentsByIdRef.current = new Map();
      approvalsByIdRef.current = new Map();
      agentLatestTaskRef.current = new Map();
      return;
    }

    let cancelled = false;
    setIsFeedLoading(true);
    setFeedError(null);

    const loadInitial = async () => {
      try {
        const nextBoards: BoardRead[] = [];
        for (let offset = 0; offset < PAGED_MAX; offset += PAGED_LIMIT) {
          const result = await listBoardsApiV1BoardsGet({
            limit: PAGED_LIMIT,
            offset,
          });
          if (cancelled) return;
          if (result.status !== 200) {
            throw new Error("Unable to load boards.");
          }
          const items = result.data.items ?? [];
          nextBoards.push(...items);
          if (items.length < PAGED_LIMIT) break;
        }

        if (cancelled) return;
        setBoards(nextBoards);
        boardsByIdRef.current = new Map(
          nextBoards.map((board) => [board.id, board]),
        );

        const seeded: FeedItem[] = [];
        const seedSeen = new Set<string>();

        const snapshotResults = await Promise.allSettled(
          nextBoards.map((board) =>
            getBoardSnapshotApiV1BoardsBoardIdSnapshotGet(board.id),
          ),
        );
        if (cancelled) return;

        snapshotResults.forEach((result, index) => {
          if (result.status !== "fulfilled") return;
          if (result.value.status !== 200) return;
          const board = nextBoards[index];
          const snapshot = result.value.data;

          (snapshot.tasks ?? []).forEach((task) => {
            taskMetaByIdRef.current.set(task.id, {
              title: task.title,
              boardId: board.id,
            });
          });

          (snapshot.agents ?? []).forEach((agent) => {
            const normalized = normalizeAgent(agent);
            agentsByIdRef.current.set(normalized.id, normalized);
            const agentItem = mapAgentEvent(normalized, null, true);
            if (!agentItem || seedSeen.has(agentItem.id)) return;
            seedSeen.add(agentItem.id);
            seeded.push(agentItem);
          });

          (snapshot.approvals ?? []).forEach((approval) => {
            approvalsByIdRef.current.set(approval.id, approval);
            const approvalItem = mapApprovalEvent(approval, board.id, null);
            if (seedSeen.has(approvalItem.id)) return;
            seedSeen.add(approvalItem.id);
            seeded.push(approvalItem);
          });

          (snapshot.chat_messages ?? []).forEach((memory) => {
            const chatItem = mapBoardChat(memory, board.id);
            if (seedSeen.has(chatItem.id)) return;
            seedSeen.add(chatItem.id);
            seeded.push(chatItem);
          });
        });

        // Sync agent topology state after snapshot
        if (!cancelled) {
          setAgentsState(Array.from(agentsByIdRef.current.values()));
        }

        for (let offset = 0; offset < PAGED_MAX; offset += PAGED_LIMIT) {
          const result = await listActivityApiV1ActivityGet({
            limit: PAGED_LIMIT,
            offset,
          });
          if (cancelled) return;
          if (result.status !== 200) {
            throw new Error("Unable to load activity feed.");
          }
          const items = result.data.items ?? [];
          for (const event of items) {
            const mapped = mapTaskActivity(event);
            if (!mapped || seedSeen.has(mapped.id)) continue;
            seedSeen.add(mapped.id);
            seeded.push(mapped);
          }
          if (items.length < PAGED_LIMIT) break;
        }

        seeded.sort((a, b) => {
          const aTime = apiDatetimeToMs(a.created_at) ?? 0;
          const bTime = apiDatetimeToMs(b.created_at) ?? 0;
          return bTime - aTime;
        });
        const next = seeded.slice(0, MAX_FEED_ITEMS);
        if (cancelled) return;
        setFeedItems(next);
        seenIdsRef.current = new Set(next.map((item) => item.id));
      } catch (err) {
        if (cancelled) return;
        setFeedError(
          err instanceof Error ? err.message : "Unable to load activity feed.",
        );
      } finally {
        if (cancelled) return;
        setIsFeedLoading(false);
      }
    };

    void loadInitial();
    return () => {
      cancelled = true;
    };
  }, [isSignedIn, mapAgentEvent, mapApprovalEvent, mapBoardChat, mapTaskActivity]);

  // ── Effect: Task SSE stream ─────────────────────────────────────────────────

  useEffect(() => {
    if (!isPageActive) return;
    if (!isSignedIn) return;
    if (boardIds.length === 0) return;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    boardIds.forEach((boardId, index) => {
      const boardDelay = index * STREAM_CONNECT_SPACING_MS;
      const abortController = new AbortController();
      const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
      let reconnectTimeout: number | undefined;
      let connectTimer: number | undefined;

      const connect = async () => {
        try {
          const since = latestTimestamp(
            (item) =>
              item.board_id === boardId && isTaskEventType(item.event_type),
          );
          const streamResult =
            await streamTasksApiV1BoardsBoardIdTasksStreamGet(
              boardId,
              since ? { since } : undefined,
              {
                headers: { Accept: "text/event-stream" },
                signal: abortController.signal,
              },
            );
          if (streamResult.status !== 200) {
            throw new Error("Unable to connect task stream.");
          }
          const response = streamResult.data as Response;
          if (!(response instanceof Response) || !response.body) {
            throw new Error("Unable to connect task stream.");
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length) backoff.reset();
            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary !== -1) {
              const raw = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const lines = raw.split("\n");
              let eventType = "message";
              let data = "";
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  eventType = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                  data += line.slice(5).trim();
                }
              }
              if (eventType === "task" && data) {
                try {
                  const payload = JSON.parse(data) as {
                    type?: string;
                    activity?: ActivityEventRead;
                    task?: TaskRead;
                    comment?: TaskCommentRead;
                  };
                  if (payload.task) {
                    updateTaskMeta(payload.task, boardId);
                  }
                  if (payload.activity) {
                    const mapped = mapTaskActivity(payload.activity, boardId);
                    if (mapped) {
                      if (!mapped.task_title && payload.task?.title) {
                        mapped.task_title = payload.task.title;
                        mapped.title = payload.task.title;
                      }
                      pushFeedItem(mapped);
                    }
                    // Track per-agent latest task for topology panel
                    if (payload.activity.agent_id && payload.task) {
                      updateAgentTask(payload.activity.agent_id, {
                        title: payload.task.title,
                        boardName: boardNameForId(boardId),
                        eventType: payload.activity.event_type,
                        updatedAt: payload.activity.created_at,
                      });
                    }
                  } else if (
                    payload.type === "task.comment" &&
                    payload.comment
                  ) {
                    pushFeedItem(mapTaskComment(payload.comment, boardId));
                    // Track per-agent latest task for comment events
                    if (payload.comment.agent_id) {
                      const meta = payload.comment.task_id
                        ? taskMetaByIdRef.current.get(payload.comment.task_id)
                        : null;
                      if (meta) {
                        updateAgentTask(payload.comment.agent_id, {
                          title: meta.title,
                          boardName: boardNameForId(boardId),
                          eventType: "task.comment",
                          updatedAt: payload.comment.created_at,
                        });
                      }
                    }
                  }
                } catch {
                  // Ignore malformed payloads.
                }
              }
              boundary = buffer.indexOf("\n\n");
            }
          }
        } catch {
          // Reconnect handled below.
        }

        if (!cancelled) {
          if (reconnectTimeout !== undefined) {
            window.clearTimeout(reconnectTimeout);
          }
          const delay = backoff.nextDelayMs();
          reconnectTimeout = window.setTimeout(() => {
            reconnectTimeout = undefined;
            void connect();
          }, delay);
        }
      };

      connectTimer = window.setTimeout(() => {
        connectTimer = undefined;
        void connect();
      }, boardDelay);

      cleanups.push(() => {
        abortController.abort();
        if (connectTimer !== undefined) window.clearTimeout(connectTimer);
        if (reconnectTimeout !== undefined)
          window.clearTimeout(reconnectTimeout);
      });
    });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [
    boardIds,
    boardNameForId,
    isPageActive,
    isSignedIn,
    latestTimestamp,
    mapTaskActivity,
    mapTaskComment,
    pushFeedItem,
    updateAgentTask,
    updateTaskMeta,
  ]);

  // ── Effect: Approval SSE stream ─────────────────────────────────────────────

  useEffect(() => {
    if (!isPageActive) return;
    if (!isSignedIn) return;
    if (boardIds.length === 0) return;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    boardIds.forEach((boardId, index) => {
      const boardDelay = index * STREAM_CONNECT_SPACING_MS;
      const abortController = new AbortController();
      const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
      let reconnectTimeout: number | undefined;
      let connectTimer: number | undefined;

      const connect = async () => {
        try {
          const since = latestTimestamp(
            (item) =>
              item.board_id === boardId &&
              item.event_type.startsWith("approval."),
          );
          const streamResult =
            await streamApprovalsApiV1BoardsBoardIdApprovalsStreamGet(
              boardId,
              since ? { since } : undefined,
              {
                headers: { Accept: "text/event-stream" },
                signal: abortController.signal,
              },
            );
          if (streamResult.status !== 200) {
            throw new Error("Unable to connect approvals stream.");
          }
          const response = streamResult.data as Response;
          if (!(response instanceof Response) || !response.body) {
            throw new Error("Unable to connect approvals stream.");
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length) backoff.reset();
            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary !== -1) {
              const raw = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const lines = raw.split("\n");
              let eventType = "message";
              let data = "";
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  eventType = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                  data += line.slice(5).trim();
                }
              }
              if (eventType === "approval" && data) {
                try {
                  const payload = JSON.parse(data) as {
                    approval?: ApprovalRead;
                  };
                  if (payload.approval) {
                    const previous =
                      approvalsByIdRef.current.get(payload.approval.id) ?? null;
                    approvalsByIdRef.current.set(
                      payload.approval.id,
                      payload.approval,
                    );
                    pushFeedItem(
                      mapApprovalEvent(payload.approval, boardId, previous),
                    );
                  }
                } catch {
                  // Ignore malformed payloads.
                }
              }
              boundary = buffer.indexOf("\n\n");
            }
          }
        } catch {
          // Reconnect handled below.
        }

        if (!cancelled) {
          if (reconnectTimeout !== undefined) {
            window.clearTimeout(reconnectTimeout);
          }
          const delay = backoff.nextDelayMs();
          reconnectTimeout = window.setTimeout(() => {
            reconnectTimeout = undefined;
            void connect();
          }, delay);
        }
      };

      connectTimer = window.setTimeout(() => {
        connectTimer = undefined;
        void connect();
      }, boardDelay);

      cleanups.push(() => {
        abortController.abort();
        if (connectTimer !== undefined) window.clearTimeout(connectTimer);
        if (reconnectTimeout !== undefined)
          window.clearTimeout(reconnectTimeout);
      });
    });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [
    boardIds,
    isPageActive,
    isSignedIn,
    latestTimestamp,
    mapApprovalEvent,
    pushFeedItem,
  ]);

  // ── Effect: Board memory (chat) SSE stream ──────────────────────────────────

  useEffect(() => {
    if (!isPageActive) return;
    if (!isSignedIn) return;
    if (boardIds.length === 0) return;

    let cancelled = false;
    const cleanups: Array<() => void> = [];

    boardIds.forEach((boardId, index) => {
      const boardDelay = index * STREAM_CONNECT_SPACING_MS;
      const abortController = new AbortController();
      const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
      let reconnectTimeout: number | undefined;
      let connectTimer: number | undefined;

      const connect = async () => {
        try {
          const since = latestTimestamp(
            (item) =>
              item.board_id === boardId &&
              (item.event_type === "board.chat" ||
                item.event_type === "board.command"),
          );
          const params = { is_chat: true, ...(since ? { since } : {}) };
          const streamResult =
            await streamBoardMemoryApiV1BoardsBoardIdMemoryStreamGet(
              boardId,
              params,
              {
                headers: { Accept: "text/event-stream" },
                signal: abortController.signal,
              },
            );
          if (streamResult.status !== 200) {
            throw new Error("Unable to connect board chat stream.");
          }
          const response = streamResult.data as Response;
          if (!(response instanceof Response) || !response.body) {
            throw new Error("Unable to connect board chat stream.");
          }
          const reader = response.body.getReader();
          const decoder = new TextDecoder();
          let buffer = "";

          while (!cancelled) {
            const { value, done } = await reader.read();
            if (done) break;
            if (value && value.length) backoff.reset();
            buffer += decoder.decode(value, { stream: true });
            buffer = buffer.replace(/\r\n/g, "\n");
            let boundary = buffer.indexOf("\n\n");
            while (boundary !== -1) {
              const raw = buffer.slice(0, boundary);
              buffer = buffer.slice(boundary + 2);
              const lines = raw.split("\n");
              let eventType = "message";
              let data = "";
              for (const line of lines) {
                if (line.startsWith("event:")) {
                  eventType = line.slice(6).trim();
                } else if (line.startsWith("data:")) {
                  data += line.slice(5).trim();
                }
              }
              if (eventType === "memory" && data) {
                try {
                  const payload = JSON.parse(data) as {
                    memory?: BoardMemoryRead;
                  };
                  if (payload.memory?.tags?.includes("chat")) {
                    pushFeedItem(mapBoardChat(payload.memory, boardId));
                  }
                } catch {
                  // Ignore malformed payloads.
                }
              }
              boundary = buffer.indexOf("\n\n");
            }
          }
        } catch {
          // Reconnect handled below.
        }

        if (!cancelled) {
          if (reconnectTimeout !== undefined) {
            window.clearTimeout(reconnectTimeout);
          }
          const delay = backoff.nextDelayMs();
          reconnectTimeout = window.setTimeout(() => {
            reconnectTimeout = undefined;
            void connect();
          }, delay);
        }
      };

      connectTimer = window.setTimeout(() => {
        connectTimer = undefined;
        void connect();
      }, boardDelay);

      cleanups.push(() => {
        abortController.abort();
        if (connectTimer !== undefined) window.clearTimeout(connectTimer);
        if (reconnectTimeout !== undefined)
          window.clearTimeout(reconnectTimeout);
      });
    });

    return () => {
      cancelled = true;
      cleanups.forEach((fn) => fn());
    };
  }, [
    boardIds,
    isPageActive,
    isSignedIn,
    latestTimestamp,
    mapBoardChat,
    pushFeedItem,
  ]);

  // ── Effect: Agent SSE stream ────────────────────────────────────────────────

  useEffect(() => {
    if (!isPageActive) return;
    if (!isSignedIn || !isOrgAdmin) return;

    let cancelled = false;
    const abortController = new AbortController();
    const backoff = createExponentialBackoff(SSE_RECONNECT_BACKOFF);
    let reconnectTimeout: number | undefined;

    const connect = async () => {
      try {
        const since = latestTimestamp((item) =>
          item.event_type.startsWith("agent."),
        );
        const streamResult = await streamAgentsApiV1AgentsStreamGet(
          since ? { since } : undefined,
          {
            headers: { Accept: "text/event-stream" },
            signal: abortController.signal,
          },
        );
        if (streamResult.status !== 200) {
          throw new Error("Unable to connect agent stream.");
        }
        const response = streamResult.data as Response;
        if (!(response instanceof Response) || !response.body) {
          throw new Error("Unable to connect agent stream.");
        }
        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (!cancelled) {
          const { value, done } = await reader.read();
          if (done) break;
          if (value && value.length) backoff.reset();
          buffer += decoder.decode(value, { stream: true });
          buffer = buffer.replace(/\r\n/g, "\n");
          let boundary = buffer.indexOf("\n\n");
          while (boundary !== -1) {
            const raw = buffer.slice(0, boundary);
            buffer = buffer.slice(boundary + 2);
            const lines = raw.split("\n");
            let eventType = "message";
            let data = "";
            for (const line of lines) {
              if (line.startsWith("event:")) {
                eventType = line.slice(6).trim();
              } else if (line.startsWith("data:")) {
                data += line.slice(5).trim();
              }
            }
            if (eventType === "agent" && data) {
              try {
                const payload = JSON.parse(data) as { agent?: AgentRead };
                if (payload.agent) {
                  const normalized = normalizeAgent(payload.agent);
                  const previous =
                    agentsByIdRef.current.get(normalized.id) ?? null;
                  agentsByIdRef.current.set(normalized.id, normalized);
                  // Sync topology panel state
                  setAgentsState(Array.from(agentsByIdRef.current.values()));
                  const mapped = mapAgentEvent(normalized, previous, false);
                  if (mapped) {
                    pushFeedItem(mapped);
                  }
                }
              } catch {
                // Ignore malformed payloads.
              }
            }
            boundary = buffer.indexOf("\n\n");
          }
        }
      } catch {
        // Reconnect handled below.
      }

      if (!cancelled) {
        if (reconnectTimeout !== undefined) {
          window.clearTimeout(reconnectTimeout);
        }
        const delay = backoff.nextDelayMs();
        reconnectTimeout = window.setTimeout(() => {
          reconnectTimeout = undefined;
          void connect();
        }, delay);
      }
    };

    void connect();
    return () => {
      cancelled = true;
      abortController.abort();
      if (reconnectTimeout !== undefined) {
        window.clearTimeout(reconnectTimeout);
      }
    };
  }, [
    isOrgAdmin,
    isPageActive,
    isSignedIn,
    latestTimestamp,
    mapAgentEvent,
    pushFeedItem,
  ]);

  // ── Derived state ───────────────────────────────────────────────────────────

  const orderedFeed = useMemo(() => {
    return [...feedItems].sort((a, b) => {
      const aTime = apiDatetimeToMs(a.created_at) ?? 0;
      const bTime = apiDatetimeToMs(b.created_at) ?? 0;
      return bTime - aTime;
    });
  }, [feedItems]);

  const selectedFeedItemId = useMemo(() => {
    if (!selectedEventId) return null;
    const directMatch = orderedFeed.find(
      (item) => item.source_event_id === selectedEventId,
    );
    if (directMatch) return directMatch.id;
    const fallbackMatch = orderedFeed.find(
      (item) =>
        item.id === selectedEventId ||
        item.id === `activity:${selectedEventId}`,
    );
    return fallbackMatch?.id ?? null;
  }, [orderedFeed, selectedEventId]);

  useEffect(() => {
    if (!selectedFeedItemId) {
      setHighlightedFeedItemId(null);
      return;
    }

    setHighlightedFeedItemId(selectedFeedItemId);
    const scrollTimeout = window.setTimeout(() => {
      const element = document.getElementById(
        feedItemElementId(selectedFeedItemId),
      );
      if (!element) return;
      element.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 50);

    const clearHighlightTimeout = window.setTimeout(() => {
      setHighlightedFeedItemId((current) =>
        current === selectedFeedItemId ? null : current,
      );
    }, 4_000);

    return () => {
      window.clearTimeout(scrollTimeout);
      window.clearTimeout(clearHighlightTimeout);
    };
  }, [selectedFeedItemId]);

  const hasUnresolvedDeepLink = Boolean(
    selectedEventId && !selectedFeedItemId && !isFeedLoading && !feedError,
  );

  const onlineAgentCount = useMemo(
    () =>
      agentsState.filter((a) => normalizeStatus(a.status) === "online").length,
    [agentsState],
  );

  // ── Effect: 15s relative-timestamp refresh ──────────────────────────────────
  // Forces re-render so relative times ("2 minutes ago") stay accurate.
  const [, setTickCount] = useState(0);
  useEffect(() => {
    if (!isSignedIn) return;
    const interval = window.setInterval(() => {
      setTickCount((n) => n + 1);
    }, 15_000);
    return () => window.clearInterval(interval);
  }, [isSignedIn]);

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <DashboardShell>
      {isMounted ? (
        <>
          <SignedOut>
            <SignedOutPanel
              message="Sign in to view the feed."
              forceRedirectUrl="/activity"
              signUpForceRedirectUrl="/activity"
              mode="redirect"
              buttonTestId="activity-signin"
            />
          </SignedOut>
          <SignedIn>
            <DashboardSidebar />
            <main className="flex-1 overflow-y-auto bg-slate-50 dark:bg-zinc-950">
              {/* Page header */}
              <div className="sticky top-0 z-30 border-b border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900">
                <div className="px-4 py-4 md:px-8 md:py-6">
                  <div className="flex flex-wrap items-center justify-between gap-4">
                    <div>
                      <div className="flex items-center gap-2">
                        <ActivityIcon className="h-5 w-5 text-slate-600 dark:text-zinc-400" />
                        <h1 className="font-heading text-2xl font-semibold tracking-tight text-slate-900 dark:text-zinc-100">
                          Activity
                        </h1>
                        {/* Live pulse indicator */}
                        <span className="flex items-center gap-1 rounded-full border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/30 px-2 py-0.5">
                          <span className="relative flex h-1.5 w-1.5">
                            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-75" />
                            <span className="relative inline-flex h-1.5 w-1.5 rounded-full bg-emerald-500" />
                          </span>
                          <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-600 dark:text-emerald-400">
                            Live
                          </span>
                        </span>
                      </div>
                      <p className="mt-1 text-sm text-slate-500 dark:text-zinc-400">
                        Realtime task, approval, agent, and board-chat activity
                        across all boards.
                        {onlineAgentCount > 0 ? (
                          <span className="ml-2 font-medium text-emerald-600 dark:text-emerald-400">
                            {onlineAgentCount} agent
                            {onlineAgentCount !== 1 ? "s" : ""} online.
                          </span>
                        ) : null}
                      </p>
                    </div>
                    {/* Live stream indicator */}
                    <div className="flex items-center gap-1.5 text-slate-400 dark:text-zinc-600">
                      <Radio className="h-3.5 w-3.5" />
                      <span className="text-xs">Streaming</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 md:p-8">
                {/* Agent topology section */}
                {agentsState.length > 0 ? (
                  <AgentTopologyPanel
                    agents={agentsState}
                    agentTaskMap={agentTaskMap}
                  />
                ) : null}

                {/* Deep-link notice */}
                {hasUnresolvedDeepLink ? (
                  <div className="mb-4 rounded-lg border border-amber-300 dark:border-amber-700 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300">
                    Requested activity item is not in the current feed window
                    yet.
                  </div>
                ) : null}

                <TimeGroupedFeed
                  isLoading={isFeedLoading}
                  errorMessage={feedError}
                  items={orderedFeed}
                  highlightedId={highlightedFeedItemId}
                />
              </div>
            </main>
          </SignedIn>
        </>
      ) : null}
    </DashboardShell>
  );
}
