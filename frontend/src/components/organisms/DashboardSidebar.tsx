"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Activity,
  BarChart3,
  Bot,
  Boxes,
  CheckCircle2,
  Folder,
  Building2,
  LayoutGrid,
  Moon,
  Network,
  Radio,
  Settings,
  Store,
  Sun,
  Tags,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";

import { useAuth } from "@/auth/clerk";
import { ApiError } from "@/api/mutator";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import {
  type healthzHealthzGetResponse,
  useHealthzHealthzGet,
} from "@/api/generated/default/default";
import {
  listApprovalsApiV1BoardsBoardIdApprovalsGet,
} from "@/api/generated/approvals/approvals";
import {
  listBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import { cn } from "@/lib/utils";

function usePendingApprovalsCount(isSignedIn: boolean | undefined) {
  return useQuery<number>({
    queryKey: ["sidebar", "pending-approvals-count"],
    enabled: Boolean(isSignedIn),
    refetchInterval: 30_000,
    refetchOnMount: "always",
    retry: false,
    queryFn: async () => {
      const boardsResponse = await listBoardsApiV1BoardsGet(undefined, {
        cache: "no-store",
      });
      if (boardsResponse.status !== 200) return 0;
      const boards = boardsResponse.data.items ?? [];
      if (boards.length === 0) return 0;

      const results = await Promise.allSettled(
        boards.map((board) =>
          listApprovalsApiV1BoardsBoardIdApprovalsGet(
            board.id,
            { status: "pending", limit: 1 },
            { cache: "no-store" },
          ),
        ),
      );

      let count = 0;
      for (const result of results) {
        if (result.status === "fulfilled" && result.value.status === 200) {
          count += result.value.data.total ?? result.value.data.items?.length ?? 0;
        }
      }
      return count;
    },
  });
}

export function DashboardSidebar() {
  const pathname = usePathname();
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const { theme, setTheme } = useTheme();
  const pendingApprovalsQuery = usePendingApprovalsCount(isSignedIn);
  const pendingCount = pendingApprovalsQuery.data ?? 0;
  const healthQuery = useHealthzHealthzGet<healthzHealthzGetResponse, ApiError>(
    {
      query: {
        refetchInterval: 30_000,
        refetchOnMount: "always",
        retry: false,
      },
      request: { cache: "no-store" },
    },
  );

  const okValue = healthQuery.data?.data?.ok;
  const systemStatus: "unknown" | "operational" | "degraded" =
    okValue === true
      ? "operational"
      : okValue === false
        ? "degraded"
        : healthQuery.isError
          ? "degraded"
          : "unknown";
  const statusLabel =
    systemStatus === "operational"
      ? "All systems operational"
      : systemStatus === "unknown"
        ? "System status unavailable"
        : "System degraded";

  return (
    <aside className="fixed inset-y-0 left-0 z-40 flex w-[280px] -translate-x-full flex-col border-r border-slate-200 bg-white pt-16 shadow-lg transition-transform duration-200 ease-in-out dark:border-zinc-800 dark:bg-zinc-950 [[data-sidebar=open]_&]:translate-x-0 md:relative md:inset-auto md:z-auto md:w-[260px] md:translate-x-0 md:pt-0 md:shadow-none md:transition-none">
      <div className="flex-1 px-3 py-4">
        <p className="px-3 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-500">
          Navigation
        </p>
        <nav className="mt-3 space-y-4 text-sm">
          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-600">
              Overview
            </p>
            <div className="mt-1 space-y-1">
              <Link
                href="/dashboard"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                  pathname === "/dashboard"
                    ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-slate-100 dark:hover:bg-zinc-800",
                )}
              >
                <BarChart3 className="h-4 w-4" />
                Dashboard
              </Link>
              <Link
                href="/activity"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                  pathname.startsWith("/activity")
                    ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-slate-100 dark:hover:bg-zinc-800",
                )}
              >
                <Activity className="h-4 w-4" />
                Live feed
              </Link>
              <Link
                href="/office"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                  pathname.startsWith("/office")
                    ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-slate-100 dark:hover:bg-zinc-800",
                )}
              >
                <Building2 className="h-4 w-4" />
                Office Floor
              </Link>
              <Link
                href="/channels"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                  pathname.startsWith("/channels")
                    ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-slate-100 dark:hover:bg-zinc-800",
                )}
              >
                <Radio className="h-4 w-4" />
                Channels
              </Link>
            </div>
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-600">
              Boards
            </p>
            <div className="mt-1 space-y-1">
              <Link
                href="/board-groups"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                  pathname.startsWith("/board-groups")
                    ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-slate-100 dark:hover:bg-zinc-800",
                )}
              >
                <Folder className="h-4 w-4" />
                Board groups
              </Link>
              <Link
                href="/boards"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                  pathname.startsWith("/boards")
                    ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-slate-100 dark:hover:bg-zinc-800",
                )}
              >
                <LayoutGrid className="h-4 w-4" />
                Boards
              </Link>
              <Link
                href="/tags"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                  pathname.startsWith("/tags")
                    ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-slate-100 dark:hover:bg-zinc-800",
                )}
              >
                <Tags className="h-4 w-4" />
                Tags
              </Link>
              <Link
                href="/approvals"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                  pathname.startsWith("/approvals")
                    ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-slate-100 dark:hover:bg-zinc-800",
                )}
              >
                <CheckCircle2 className="h-4 w-4" />
                Approvals
                {pendingCount > 0 && (
                  <span className="ml-auto rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-bold text-white leading-none">
                    {pendingCount}
                  </span>
                )}
              </Link>
              {isAdmin ? (
                <Link
                  href="/custom-fields"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                    pathname.startsWith("/custom-fields")
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <Settings className="h-4 w-4" />
                  Custom fields
                </Link>
              ) : null}
            </div>
          </div>

          <div>
            {isAdmin ? (
              <>
                <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-600">
                  Skills
                </p>
                <div className="mt-1 space-y-1">
                  <Link
                    href="/skills/marketplace"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                      pathname === "/skills" ||
                        pathname.startsWith("/skills/marketplace")
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <Store className="h-4 w-4" />
                    Marketplace
                  </Link>
                  <Link
                    href="/skills/packs"
                    className={cn(
                      "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                      pathname.startsWith("/skills/packs")
                        ? "bg-blue-100 text-blue-800 font-medium"
                        : "hover:bg-slate-100",
                    )}
                  >
                    <Boxes className="h-4 w-4" />
                    Packs
                  </Link>
                </div>
              </>
            ) : null}
          </div>

          <div>
            <p className="px-3 text-[11px] font-semibold uppercase tracking-wider text-slate-400 dark:text-zinc-600">
              Administration
            </p>
            <div className="mt-1 space-y-1">
              <Link
                href="/organization"
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                  pathname.startsWith("/organization")
                    ? "bg-blue-100 text-blue-800 font-medium dark:bg-blue-900/30 dark:text-blue-400"
                    : "hover:bg-slate-100 dark:hover:bg-zinc-800",
                )}
              >
                <Building2 className="h-4 w-4" />
                Organization
              </Link>
              {isAdmin ? (
                <Link
                  href="/gateways"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                    pathname.startsWith("/gateways")
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <Network className="h-4 w-4" />
                  Gateways
                </Link>
              ) : null}
              {isAdmin ? (
                <Link
                  href="/agents"
                  className={cn(
                    "flex items-center gap-3 rounded-lg px-3 py-2.5 text-slate-700 dark:text-zinc-300 transition",
                    pathname.startsWith("/agents")
                      ? "bg-blue-100 text-blue-800 font-medium"
                      : "hover:bg-slate-100",
                  )}
                >
                  <Bot className="h-4 w-4" />
                  Agents
                </Link>
              ) : null}
            </div>
          </div>
        </nav>
      </div>
      <div className="border-t border-slate-200 dark:border-zinc-800 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-zinc-500">
            <span
              className={cn(
                "h-2 w-2 rounded-full",
                systemStatus === "operational" && "bg-emerald-500",
                systemStatus === "degraded" && "bg-rose-500",
                systemStatus === "unknown" && "bg-slate-300 dark:bg-zinc-600",
              )}
            />
            {statusLabel}
          </div>
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-zinc-500 dark:hover:bg-zinc-800 dark:hover:text-zinc-300 transition"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>
      </div>
    </aside>
  );
}
