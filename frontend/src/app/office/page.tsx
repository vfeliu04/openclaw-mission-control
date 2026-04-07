"use client";

export const dynamic = "force-dynamic";

import { useMemo } from "react";

import { useAuth } from "@/auth/clerk";

import { DashboardPageLayout } from "@/components/templates/DashboardPageLayout";
import { AgentOfficeFloor } from "@/components/organisms/AgentOfficeFloor";

import { ApiError } from "@/api/mutator";
import {
  type listAgentsApiV1AgentsGetResponse,
  useListAgentsApiV1AgentsGet,
} from "@/api/generated/agents/agents";
import {
  type listBoardsApiV1BoardsGetResponse,
  useListBoardsApiV1BoardsGet,
} from "@/api/generated/boards/boards";
import { useOrganizationMembership } from "@/lib/use-organization-membership";

export default function OfficePage() {
  const { isSignedIn } = useAuth();
  const { isAdmin } = useOrganizationMembership(isSignedIn);

  const agentsQuery = useListAgentsApiV1AgentsGet<
    listAgentsApiV1AgentsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 15_000,
      refetchOnMount: "always",
    },
  });

  const boardsQuery = useListBoardsApiV1BoardsGet<
    listBoardsApiV1BoardsGetResponse,
    ApiError
  >(undefined, {
    query: {
      enabled: Boolean(isSignedIn && isAdmin),
      refetchInterval: 30_000,
      refetchOnMount: "always",
    },
  });

  const agents = useMemo(
    () =>
      agentsQuery.data?.status === 200
        ? (agentsQuery.data.data.items ?? [])
        : [],
    [agentsQuery.data],
  );

  const boardsById = useMemo<Record<string, string>>(() => {
    const boards =
      boardsQuery.data?.status === 200
        ? (boardsQuery.data.data.items ?? [])
        : [];
    return Object.fromEntries(boards.map((board) => [board.id, board.name]));
  }, [boardsQuery.data]);

  return (
    <DashboardPageLayout
      signedOut={{
        message: "Sign in to view the office floor.",
        forceRedirectUrl: "/office",
        signUpForceRedirectUrl: "/office",
      }}
      title="Office Floor"
      description="Live view of all agents across all boards."
      isAdmin={isAdmin}
      adminOnlyMessage="Only organization owners and admins can access the office floor."
    >
      {agentsQuery.error ? (
        <p className="mt-4 text-sm text-red-500">{agentsQuery.error.message}</p>
      ) : null}

      <AgentOfficeFloor agents={agents} tasks={[]} boardsById={boardsById} />
    </DashboardPageLayout>
  );
}
