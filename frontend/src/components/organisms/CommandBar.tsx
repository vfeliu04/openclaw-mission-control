"use client";

import * as React from "react";
import { useRouter } from "next/navigation";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import {
  LayoutDashboard,
  Zap,
  Radio,
  SquareKanban,
  Bot,
  Network,
} from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { useAuth } from "@/auth/clerk";
import { useListBoardsApiV1BoardsGet } from "@/api/generated/boards/boards";
import { useListAgentsApiV1AgentsGet } from "@/api/generated/agents/agents";
import { cn } from "@/lib/utils";

const NAV_LINKS = [
  { label: "Dashboard", url: "/dashboard", icon: LayoutDashboard },
  { label: "Live feed", url: "/activity", icon: Zap },
  { label: "Channels", url: "/channels", icon: Radio },
  { label: "Boards", url: "/boards", icon: SquareKanban },
  { label: "Agents", url: "/agents", icon: Bot },
  { label: "Gateways", url: "/gateways", icon: Network },
] as const;

export function CommandBar() {
  const [open, setOpen] = React.useState(false);
  const router = useRouter();
  const { isSignedIn } = useAuth();

  // Toggle on Cmd+K / Ctrl+K
  React.useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);

  const { data: boardsData } = useListBoardsApiV1BoardsGet(
    {},
    { query: { enabled: isSignedIn === true } },
  );

  const { data: agentsData } = useListAgentsApiV1AgentsGet(
    {},
    { query: { enabled: isSignedIn === true } },
  );

  const boards =
    boardsData?.status === 200 ? (boardsData.data.items ?? []) : [];
  const agents =
    agentsData?.status === 200 ? (agentsData.data.items ?? []) : [];

  function handleSelect(url: string) {
    router.push(url);
    setOpen(false);
  }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={setOpen}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay
          className={cn(
            "fixed inset-0 z-50 bg-slate-950/40 backdrop-blur-[2px]",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          )}
        />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className={cn(
            "fixed left-1/2 top-[20%] z-50 w-full max-w-xl -translate-x-1/2",
            "data-[state=open]:animate-in data-[state=closed]:animate-out",
            "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
            "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
            "data-[state=closed]:slide-out-to-left-1/2 data-[state=open]:slide-in-from-left-1/2",
          )}
        >
          <DialogPrimitive.Title className="sr-only">
            Command bar
          </DialogPrimitive.Title>
          <Command className="rounded-2xl border border-[color:var(--border)] bg-[color:var(--surface)] shadow-lush">
            <CommandInput placeholder="Search boards, agents, pages…" />
            <CommandList>
              <CommandEmpty>No results found.</CommandEmpty>

              <CommandGroup heading="Navigation">
                {NAV_LINKS.map(({ label, url, icon: Icon }) => (
                  <CommandItem
                    key={url}
                    value={label}
                    onSelect={() => handleSelect(url)}
                    className="gap-2"
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                    {label}
                  </CommandItem>
                ))}
              </CommandGroup>

              {boards.length > 0 && (
                <CommandGroup heading="Boards">
                  {boards.map((board) => (
                    <CommandItem
                      key={board.id}
                      value={board.name}
                      onSelect={() => handleSelect(`/boards/${board.id}`)}
                      className="gap-2"
                    >
                      <SquareKanban className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {board.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}

              {agents.length > 0 && (
                <CommandGroup heading="Agents">
                  {agents.map((agent) => (
                    <CommandItem
                      key={agent.id}
                      value={agent.name}
                      onSelect={() => handleSelect(`/agents/${agent.id}`)}
                      className="gap-2"
                    >
                      <Bot className="h-4 w-4 shrink-0 text-muted-foreground" />
                      {agent.name}
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
