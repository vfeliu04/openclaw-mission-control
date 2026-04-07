"use client";

export const dynamic = "force-dynamic";

import { useState } from "react";
import { RefreshCw } from "lucide-react";

import { useAuth } from "@/auth/clerk";
import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { useOrganizationMembership } from "@/lib/use-organization-membership";
import { Button } from "@/components/ui/button";
import { useListGatewaysApiV1GatewaysGet } from "@/api/generated/gateways/gateways";
import { useGetGatewayChannelsApiV1GatewaysGatewayIdChannelsGet } from "@/api/generated/channels/channels";
import type {
  ChannelAccountStatus,
  ChannelStatus,
} from "@/api/generated/model";
import { cn } from "@/lib/utils";

type ChannelHealthState =
  | "connected"
  | "reconnecting"
  | "error"
  | "disconnected"
  | "unconfigured";

function deriveChannelHealth(
  accounts: ChannelAccountStatus[],
): ChannelHealthState {
  if (!accounts.length) return "unconfigured";
  const acc = accounts[0];
  if (acc.last_error) return "error";
  if (acc.connected) return "connected";
  if (acc.running) return "reconnecting";
  return "disconnected";
}

const HEALTH_BADGE: Record<
  ChannelHealthState,
  { label: string; className: string }
> = {
  connected: {
    label: "Connected",
    className: "bg-emerald-100 text-emerald-700",
  },
  reconnecting: {
    label: "Reconnecting",
    className: "bg-amber-100 text-amber-700",
  },
  error: { label: "Error", className: "bg-red-100 text-red-700" },
  disconnected: {
    label: "Disconnected",
    className: "bg-slate-100 text-slate-500",
  },
  unconfigured: {
    label: "Unconfigured",
    className: "bg-slate-100 text-slate-400",
  },
};

const CHANNEL_ACCENT: Record<string, string> = {
  whatsapp: "#25D366",
  imessage: "#007AFF",
  telegram: "#2AABEE",
  discord: "#5865F2",
  slack: "#E01E5A",
  signal: "#3A76F0",
  matrix: "#0DBD8B",
  web: "#6366F1",
};

function ChannelCard({ channel }: { channel: ChannelStatus }) {
  const accounts = channel.accounts ?? [];
  const defaultAcc =
    accounts.find((a) => a.account_id === channel.default_account_id) ??
    accounts[0];
  const health = deriveChannelHealth(accounts);
  const badge = HEALTH_BADGE[health];
  const accent = CHANNEL_ACCENT[channel.id] ?? "#94a3b8";
  const lastActivity = defaultAcc
    ? Math.max(
        defaultAcc.last_inbound_at ?? 0,
        defaultAcc.last_outbound_at ?? 0,
      )
    : 0;

  return (
    <div
      className="rounded-xl border border-slate-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-sm"
      style={{ borderLeft: `4px solid ${accent}` }}
    >
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-semibold text-slate-800 dark:text-zinc-100">{channel.label}</p>
          {channel.detail_label && (
            <p className="text-xs text-slate-500 dark:text-zinc-400">{channel.detail_label}</p>
          )}
        </div>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-xs font-medium",
            badge.className,
          )}
        >
          {badge.label}
        </span>
      </div>

      {defaultAcc?.last_error && (
        <p className="mt-2 rounded bg-red-50 px-2 py-1 font-mono text-xs text-red-600">
          {defaultAcc.last_error}
        </p>
      )}

      <div className="mt-3 space-y-1 text-xs text-slate-500 dark:text-zinc-400">
        {defaultAcc?.name && (
          <p>
            Account:{" "}
            <span className="text-slate-700 dark:text-zinc-300">{defaultAcc.name}</span>
          </p>
        )}
        {lastActivity > 0 && (
          <p>
            Last activity:{" "}
            <span className="text-slate-700">
              {new Date(lastActivity).toLocaleString()}
            </span>
          </p>
        )}
        {(defaultAcc?.reconnect_attempts ?? 0) > 0 && (
          <p className="text-amber-600">
            Reconnect attempts: {defaultAcc!.reconnect_attempts}
          </p>
        )}
        {accounts.length > 1 && <p>{accounts.length} accounts</p>}
      </div>
    </div>
  );
}

export default function ChannelsPage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);
  const [probe, setProbe] = useState(false);

  const gatewaysQuery = useListGatewaysApiV1GatewaysGet(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 60_000,
    },
  });

  const gatewayItems =
    gatewaysQuery.data?.status === 200
      ? (gatewaysQuery.data.data.items ?? [])
      : [];
  const firstGateway = gatewayItems[0];

  const channelsQuery =
    useGetGatewayChannelsApiV1GatewaysGatewayIdChannelsGet(
      firstGateway?.id ?? "",
      { probe },
      {
        query: {
          enabled: Boolean(isSignedIn && isAdmin && firstGateway?.id),
          refetchInterval: 30_000,
          refetchOnMount: "always",
        },
      },
    );

  function handleRunProbe() {
    setProbe(true);
    void channelsQuery.refetch().finally(() => setProbe(false));
  }

  const channelData =
    channelsQuery.data?.status === 200 ? channelsQuery.data.data : null;
  const channels: ChannelStatus[] = channelData?.channels ?? [];
  const gatewayError = channelData?.error ?? null;
  const isFetching = channelsQuery.isFetching;

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view channels.",
        forceRedirectUrl: "/channels",
      }}
      title="Channels"
      description="Connected messaging channels on your openclaw gateway."
      isAdmin={isAdmin}
      adminOnlyMessage="You need admin access to view channels."
      stickyHeader
      headerActions={
        <Button
          variant="outline"
          size="sm"
          onClick={handleRunProbe}
          disabled={isFetching || !firstGateway}
        >
          <RefreshCw
            className={cn("mr-2 h-3.5 w-3.5", isFetching && "animate-spin")}
          />
          {isFetching ? "Probing…" : "Run probe"}
        </Button>
      }
    >
      {gatewayError && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          Gateway error: {gatewayError}
        </div>
      )}
      {!firstGateway && !gatewaysQuery.isLoading && (
        <div className="py-16 text-center text-sm text-slate-400">
          No gateways configured. Add a gateway in Administration → Gateways.
        </div>
      )}
      {channels.length === 0 &&
        firstGateway &&
        !channelsQuery.isLoading &&
        !gatewayError && (
          <div className="py-16 text-center text-sm text-slate-400">
            No channels found. Ensure your openclaw gateway has channel plugins
            installed.
          </div>
        )}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {channels.map((ch: ChannelStatus) => (
          <ChannelCard key={ch.id} channel={ch} />
        ))}
      </div>
    </DashboardPageLayout>
  );
}
