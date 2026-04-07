"use client";

export const dynamic = "force-dynamic";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";

import { useAuth } from "@/auth/clerk";
import { useQueryClient } from "@tanstack/react-query";
import { AgentsTable } from "@/components/agents/AgentsTable";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { Button } from "@/components/ui/button";
import { ConfirmActionDialog } from "@/components/ui/confirm-action-dialog";
import { Textarea } from "@/components/ui/textarea";

import { ApiError } from "@/api/mutator";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import {
  type gatewaysStatusApiV1GatewaysStatusGetResponse,
  type getGatewayApiV1GatewaysGatewayIdGetResponse,
  useGatewaysStatusApiV1GatewaysStatusGet,
  useGetGatewayApiV1GatewaysGatewayIdGet,
} from "@/api/generated/gateways/gateways";
import {
  type listAgentsApiV1AgentsGetResponse,
  getListAgentsApiV1AgentsGetQueryKey,
  useDeleteAgentApiV1AgentsAgentIdDelete,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  useGetWorkspaceFileApiV1GatewaysGatewayIdWorkspaceFilenameGet,
  useUpdateWorkspaceFileApiV1GatewaysGatewayIdWorkspaceFilenamePut,
  useRegenerateAssistantPromptApiV1GatewaysGatewayIdWorkspaceRegenerateAssistantPost,
  useRegenerateLeadPromptsApiV1GatewaysGatewayIdWorkspaceRegenerateLeadsPost,
  useSendTriggerMessageApiV1GatewaysGatewayIdWorkspaceSendTriggerPost,
} from "@/api/generated/gateway-workspace/gateway-workspace";
import { type AgentRead } from "@/api/generated/model";
import { formatTimestamp } from "@/lib/formatters";
import { createOptimisticListDeleteMutation } from "@/lib/list-delete";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { cn } from "@/lib/utils";

const maskToken = (value?: string | null) => {
  if (!value) return "—";
  if (value.length <= 8) return "••••";
  return `••••${value.slice(-4)}`;
};

type ViewTab = "info" | "assistant";

export default function GatewayDetailPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const params = useParams();
  const { isSignedIn } = useAuth();
  const gatewayIdParam = params?.gatewayId;
  const gatewayId = Array.isArray(gatewayIdParam)
    ? gatewayIdParam[0]
    : gatewayIdParam;

  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [deleteTarget, setDeleteTarget] = useState<AgentRead | null>(null);
  const [viewTab, setViewTab] = useState<ViewTab>("info");

  // Local editor state for USER.md and SOUL.md
  const [userMdDraft, setUserMdDraft] = useState<string>("");
  const [bootMdDraft, setBootMdDraft] = useState<string>("");
  const [userMdSaved, setUserMdSaved] = useState(false);
  const [bootMdSaved, setBootMdSaved] = useState(false);

  const agentsKey = getListAgentsApiV1AgentsGetQueryKey(
    gatewayId ? { gateway_id: gatewayId } : undefined,
  );

  const gatewayQuery = useGetGatewayApiV1GatewaysGatewayIdGet<
    getGatewayApiV1GatewaysGatewayIdGetResponse,
    ApiError
  >(gatewayId ?? "", {
    query: {
      enabled: Boolean(isSignedIn && isAdmin && gatewayId),
      refetchInterval: 30_000,
    },
  });

  const gateway =
    gatewayQuery.data?.status === 200 ? gatewayQuery.data.data : null;

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
    },
  });

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(gatewayId ? { gateway_id: gatewayId } : undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin && gatewayId),
      refetchInterval: 15_000,
    },
  });

  // Workspace file queries — only fetch when on Assistant tab
  const userMdQuery =
    useGetWorkspaceFileApiV1GatewaysGatewayIdWorkspaceFilenameGet(
      gatewayId ?? "",
      "USER.md",
      {
        query: {
          enabled: Boolean(isSignedIn && isAdmin && gatewayId && viewTab === "assistant"),
        },
      },
    );

  const bootMdQuery =
    useGetWorkspaceFileApiV1GatewaysGatewayIdWorkspaceFilenameGet(
      gatewayId ?? "",
      "SOUL.md",
      {
        query: {
          enabled: Boolean(isSignedIn && isAdmin && gatewayId && viewTab === "assistant"),
        },
      },
    );

  // Sync fetched content into draft state
  useEffect(() => {
    const content =
      userMdQuery.data?.status === 200
        ? (userMdQuery.data.data.content ?? "")
        : null;
    if (content !== null) setUserMdDraft(content);
  }, [userMdQuery.data]);

  useEffect(() => {
    const content =
      bootMdQuery.data?.status === 200
        ? (bootMdQuery.data.data.content ?? "")
        : null;
    if (content !== null) setBootMdDraft(content);
  }, [bootMdQuery.data]);

  // Mutations
  const updateFileMutation =
    useUpdateWorkspaceFileApiV1GatewaysGatewayIdWorkspaceFilenamePut();

  const regenerateMutation =
    useRegenerateAssistantPromptApiV1GatewaysGatewayIdWorkspaceRegenerateAssistantPost();

  const regenerateLeadsMutation =
    useRegenerateLeadPromptsApiV1GatewaysGatewayIdWorkspaceRegenerateLeadsPost();

  const sendTriggerMutation =
    useSendTriggerMessageApiV1GatewaysGatewayIdWorkspaceSendTriggerPost();

  const [triggerMessage, setTriggerMessage] = useState("morning_briefing");

  const deleteMutation = useDeleteAgentApiV1AgentsAgentIdDelete<
    ApiError,
    { previous?: listAgentsApiV1AgentsGetResponse }
  >(
    {
      mutation: createOptimisticListDeleteMutation<
        AgentRead,
        listAgentsApiV1AgentsGetResponse,
        { agentId: string }
      >({
        queryClient,
        queryKey: agentsKey,
        getItemId: (agent) => agent.id,
        getDeleteId: ({ agentId }) => agentId,
        onSuccess: () => {
          setDeleteTarget(null);
        },
        invalidateQueryKeys: [agentsKey],
      }),
    },
    queryClient,
  );

  const statusParams = gateway
    ? {
        gateway_url: gateway.url,
        gateway_token: gateway.token ?? undefined,
        gateway_disable_device_pairing: gateway.disable_device_pairing,
        gateway_allow_insecure_tls: gateway.allow_insecure_tls,
      }
    : {};

  const statusQuery = useGatewaysStatusApiV1GatewaysStatusGet<
    gatewaysStatusApiV1GatewaysStatusGetResponse,
    ApiError
  >(statusParams, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin && gateway),
      refetchInterval: 15_000,
    },
  });

  const agents = useMemo(
    () =>
      agentsQuery.data?.status === 200
        ? (agentsQuery.data.data.items ?? [])
        : [],
    [agentsQuery.data],
  );
  const boards = useMemo(
    () =>
      boardsQuery.data?.status === 200
        ? (boardsQuery.data.data.items ?? [])
        : [],
    [boardsQuery.data],
  );

  const status =
    statusQuery.data?.status === 200 ? statusQuery.data.data : null;
  const isConnected = status?.connected ?? false;

  const title = useMemo(
    () => (gateway?.name ? gateway.name : "Gateway"),
    [gateway?.name],
  );

  const handleDelete = () => {
    if (!deleteTarget) return;
    deleteMutation.mutate({ agentId: deleteTarget.id });
  };

  async function handleSaveFile(filename: "USER.md" | "SOUL.md", content: string) {
    if (!gatewayId) return;
    await updateFileMutation.mutateAsync({
      gatewayId,
      filename,
      data: { content },
    });
    if (filename === "USER.md") setUserMdSaved(true);
    else setBootMdSaved(true);
    setTimeout(() => {
      if (filename === "USER.md") setUserMdSaved(false);
      else setBootMdSaved(false);
    }, 2000);
  }

  async function handleRegenerate() {
    if (!gatewayId) return;
    const result = await regenerateMutation.mutateAsync({ gatewayId });
    if (result.status === 200 && result.data.content) {
      setBootMdDraft(result.data.content);
    }
  }

  async function handleRegenerateLeads() {
    if (!gatewayId) return;
    await regenerateLeadsMutation.mutateAsync({ gatewayId });
  }

  async function handleSendTrigger() {
    if (!gatewayId || !triggerMessage.trim()) return;
    await sendTriggerMutation.mutateAsync({ gatewayId, data: { message: triggerMessage.trim() } });
  }

  return (
    <>
      <DashboardPageLayout
        signedOut={{
          message: "Sign in to view a gateway.",
          forceRedirectUrl: `/gateways/${gatewayId}`,
        }}
        title={title}
        description="Gateway configuration and connection details."
        headerActions={
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={() => router.push("/gateways")}>
              Back to gateways
            </Button>
            {isAdmin && gatewayId ? (
              <Button
                onClick={() => router.push(`/gateways/${gatewayId}/edit`)}
              >
                Edit gateway
              </Button>
            ) : null}
          </div>
        }
        isAdmin={isAdmin}
        adminOnlyMessage="Only organization owners and admins can access gateways."
      >
        {gatewayQuery.isLoading ? (
          <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
            Loading gateway…
          </div>
        ) : gatewayQuery.error ? (
          <div className="rounded-xl border border-rose-200 bg-rose-50 p-6 text-sm text-rose-700">
            {gatewayQuery.error.message}
          </div>
        ) : gateway ? (
          <div className="space-y-6">
            {/* Tab toggle */}
            <div className="flex gap-1 rounded-lg bg-slate-100 p-1 w-fit">
              {(["info", "assistant"] as ViewTab[]).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setViewTab(tab)}
                  className={cn(
                    "rounded-md px-4 py-1.5 text-sm font-medium capitalize transition-colors",
                    viewTab === tab
                      ? "bg-white text-slate-900 shadow-sm"
                      : "text-slate-500 hover:text-slate-700",
                  )}
                >
                  {tab === "info" ? "Info" : "Assistant"}
                </button>
              ))}
            </div>

            {/* Info tab */}
            {viewTab === "info" && (
              <>
                <div className="grid gap-6 lg:grid-cols-2">
                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Connection
                      </p>
                      <div className="flex items-center gap-2 text-xs text-slate-500">
                        <span
                          className={`h-2 w-2 rounded-full ${
                            statusQuery.isLoading
                              ? "bg-slate-300"
                              : isConnected
                                ? "bg-emerald-500"
                                : "bg-rose-500"
                          }`}
                        />
                        <span>
                          {statusQuery.isLoading
                            ? "Checking"
                            : isConnected
                              ? "Online"
                              : "Offline"}
                        </span>
                      </div>
                    </div>
                    <div className="mt-4 space-y-3 text-sm text-slate-700">
                      <div>
                        <p className="text-xs uppercase text-slate-400">
                          Gateway URL
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {gateway.url}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-400">Token</p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {maskToken(gateway.token)}
                        </p>
                      </div>
                      <div>
                        <p className="text-xs uppercase text-slate-400">
                          Device pairing
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {gateway.disable_device_pairing ? "Disabled" : "Required"}
                        </p>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Runtime
                    </p>
                    <div className="mt-4 space-y-3 text-sm text-slate-700">
                      <div>
                        <p className="text-xs uppercase text-slate-400">
                          Workspace root
                        </p>
                        <p className="mt-1 text-sm font-medium text-slate-900">
                          {gateway.workspace_root}
                        </p>
                      </div>
                      <div className="grid gap-3 sm:grid-cols-2">
                        <div>
                          <p className="text-xs uppercase text-slate-400">
                            Created
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {formatTimestamp(gateway.created_at)}
                          </p>
                        </div>
                        <div>
                          <p className="text-xs uppercase text-slate-400">
                            Updated
                          </p>
                          <p className="mt-1 text-sm font-medium text-slate-900">
                            {formatTimestamp(gateway.updated_at)}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Agents
                    </p>
                    {agentsQuery.isLoading ? (
                      <span className="text-xs text-slate-500">Loading…</span>
                    ) : (
                      <span className="text-xs text-slate-500">
                        {agents.length} total
                      </span>
                    )}
                  </div>
                  <div className="mt-4">
                    <AgentsTable
                      agents={agents}
                      boards={boards}
                      isLoading={agentsQuery.isLoading}
                      onDelete={setDeleteTarget}
                      emptyMessage="No agents assigned to this gateway."
                    />
                  </div>
                </div>
              </>
            )}

            {/* Assistant tab */}
            {viewTab === "assistant" && (
              <div className="space-y-6">
                {/* USER.md editor */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">User profile</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Stored in USER.md — who you are, your preferences, timezone.
                      </p>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSaveFile("USER.md", userMdDraft)}
                      disabled={updateFileMutation.isPending}
                    >
                      {userMdSaved ? "Saved ✓" : "Save profile"}
                    </Button>
                  </div>
                  {userMdQuery.isLoading ? (
                    <p className="text-xs text-slate-400 mt-4">Loading…</p>
                  ) : (
                    <Textarea
                      className="mt-4 font-mono text-xs min-h-48 resize-y"
                      value={userMdDraft}
                      onChange={(e) => setUserMdDraft(e.target.value)}
                      placeholder="# User Profile&#10;&#10;## Identity&#10;- Name: ..."
                    />
                  )}
                </div>

                {/* SOUL.md editor */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between mb-1">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">Assistant prompt</p>
                      <p className="text-xs text-slate-500 mt-0.5">
                        Stored in SOUL.md — the system prompt loaded at the start of every conversation.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRegenerate}
                        disabled={regenerateMutation.isPending}
                      >
                        {regenerateMutation.isPending ? "Regenerating…" : "Regenerate from boards"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={handleRegenerateLeads}
                        disabled={regenerateLeadsMutation.isPending}
                      >
                        {regenerateLeadsMutation.isPending ? "Regenerating leads…" : "Regenerate leads"}
                      </Button>
                      <Button
                        size="sm"
                        onClick={() => handleSaveFile("SOUL.md", bootMdDraft)}
                        disabled={updateFileMutation.isPending}
                      >
                        {bootMdSaved ? "Saved ✓" : "Save prompt"}
                      </Button>
                    </div>
                  </div>
                  {bootMdQuery.isLoading ? (
                    <p className="text-xs text-slate-400 mt-4">Loading…</p>
                  ) : (
                    <Textarea
                      className="mt-4 font-mono text-xs min-h-64 resize-y"
                      value={bootMdDraft}
                      onChange={(e) => setBootMdDraft(e.target.value)}
                      placeholder="# Personal Assistant Boot&#10;&#10;You are Vicente's personal AI assistant..."
                    />
                  )}
                  {regenerateMutation.isError && (
                    <p className="mt-2 text-xs text-rose-600">
                      Regeneration failed. Is the gateway online?
                    </p>
                  )}
                  {regenerateLeadsMutation.isError && (
                    <p className="mt-2 text-xs text-rose-600">
                      Lead regeneration failed. Is the gateway online?
                    </p>
                  )}
                  {regenerateLeadsMutation.isSuccess &&
                    regenerateLeadsMutation.data?.status === 200 && (
                      <p className="mt-2 text-xs text-emerald-600">
                        Leads updated: {regenerateLeadsMutation.data.data.updated} — Failed:{" "}
                        {regenerateLeadsMutation.data.data.failed}
                      </p>
                    )}
                </div>

                {/* Trigger panel */}
                <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                  <p className="text-sm font-semibold text-slate-800 mb-1">Send trigger to agent</p>
                  <p className="text-xs text-slate-500 mb-3">
                    Inject a message directly into the main agent session — useful for testing cron
                    triggers like morning briefings without waiting for the scheduled time.
                  </p>
                  <div className="flex items-center gap-2">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-3 text-sm flex-1 max-w-xs"
                      value={triggerMessage}
                      onChange={(e) => setTriggerMessage(e.target.value)}
                    >
                      <option value="morning_briefing">morning_briefing</option>
                      <option value="morning_email_digest">morning_email_digest</option>
                    </select>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={handleSendTrigger}
                      disabled={sendTriggerMutation.isPending}
                    >
                      {sendTriggerMutation.isPending ? "Sending…" : "Send trigger"}
                    </Button>
                  </div>
                  {sendTriggerMutation.isSuccess && (
                    <p className="mt-2 text-xs text-emerald-600">
                      Trigger sent ✓ — agent is processing it now.
                    </p>
                  )}
                  {sendTriggerMutation.isError && (
                    <p className="mt-2 text-xs text-rose-600">
                      Failed to send trigger. Is the gateway online?
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        ) : null}
      </DashboardPageLayout>

      <ConfirmActionDialog
        open={!!deleteTarget}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteTarget(null);
          }
        }}
        ariaLabel="Delete agent"
        title="Delete agent"
        description={
          <>
            This will remove {deleteTarget?.name}. This action cannot be undone.
          </>
        }
        errorMessage={deleteMutation.error?.message}
        onConfirm={handleDelete}
        isConfirming={deleteMutation.isPending}
      />
    </>
  );
}
