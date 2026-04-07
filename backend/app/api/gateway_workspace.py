"""Gateway workspace file endpoints (USER.md, BOOT.md)."""

from __future__ import annotations

from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlmodel import SQLModel

from sqlmodel import col, select

from app.api.deps import require_org_admin
from app.db import crud
from app.db.session import get_session
from app.models.agents import Agent
from app.models.boards import Board
from app.models.gateways import Gateway
from app.core.config import settings
from app.services.openclaw.assistant_prompt import regenerate_boot_md
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, openclaw_call, send_message
from app.services.openclaw.shared import GatewayAgentIdentity
from app.services.openclaw.workspace_service import read_workspace_file, write_workspace_file

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/gateways", tags=["gateway-workspace"])
SESSION_DEP = Depends(get_session)
ORG_ADMIN_DEP = Depends(require_org_admin)

_ALLOWED_FILES = frozenset({"USER.md", "SOUL.md"})


class WorkspaceFileContent(SQLModel):
    content: str | None = None


class WorkspaceFileUpdate(SQLModel):
    content: str


class RegenerateLeadsResult(SQLModel):
    updated: int = 0
    failed: int = 0
    errors: list[str] = []


class TriggerRequest(SQLModel):
    message: str


@router.get("/{gateway_id}/workspace/{filename}", response_model=WorkspaceFileContent)
async def get_workspace_file(
    gateway_id: UUID,
    filename: str,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> WorkspaceFileContent:
    """Read a workspace file (USER.md or BOOT.md) from the main agent."""
    if filename not in _ALLOWED_FILES:
        raise HTTPException(400, detail=f"Only {sorted(_ALLOWED_FILES)} are readable.")
    gateway = await crud.get(session, Gateway, id=gateway_id)
    if not gateway or gateway.organization_id != ctx.organization.id:
        raise HTTPException(404, detail="Gateway not found.")
    content = await read_workspace_file(gateway, filename)
    return WorkspaceFileContent(content=content)


@router.put("/{gateway_id}/workspace/{filename}", response_model=WorkspaceFileContent)
async def update_workspace_file(
    gateway_id: UUID,
    filename: str,
    payload: WorkspaceFileUpdate,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> WorkspaceFileContent:
    """Write a workspace file (USER.md or BOOT.md) to the main agent."""
    if filename not in _ALLOWED_FILES:
        raise HTTPException(400, detail=f"Only {sorted(_ALLOWED_FILES)} are editable.")
    gateway = await crud.get(session, Gateway, id=gateway_id)
    if not gateway or gateway.organization_id != ctx.organization.id:
        raise HTTPException(404, detail="Gateway not found.")
    await write_workspace_file(gateway, filename, payload.content)
    return WorkspaceFileContent(content=payload.content)


@router.post(
    "/{gateway_id}/workspace/regenerate-assistant",
    response_model=WorkspaceFileContent,
)
async def regenerate_assistant_prompt(
    gateway_id: UUID,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> WorkspaceFileContent:
    """Regenerate BOOT.md from current board list and MC API config, then push to gateway."""
    gateway = await crud.get(session, Gateway, id=gateway_id)
    if not gateway or gateway.organization_id != ctx.organization.id:
        raise HTTPException(404, detail="Gateway not found.")
    content = await regenerate_boot_md(gateway, session)
    return WorkspaceFileContent(content=content)


@router.post(
    "/{gateway_id}/workspace/reset-session",
    response_model=WorkspaceFileContent,
)
async def reset_main_session(
    gateway_id: UUID,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> WorkspaceFileContent:
    """Delete the main WhatsApp agent session so next message starts fresh with updated SOUL.md."""
    gateway = await crud.get(session, Gateway, id=gateway_id)
    if not gateway or gateway.organization_id != ctx.organization.id:
        raise HTTPException(404, detail="Gateway not found.")
    config = gateway_client_config(gateway)
    number = settings.main_whatsapp_number.strip()
    if not number:
        raise HTTPException(400, detail="MAIN_WHATSAPP_NUMBER is not configured.")
    try:
        await openclaw_call(
            "sessions.delete",
            {"id": f"agent:main:whatsapp:direct:{number}"},
            config=config,
        )
    except OpenClawGatewayError:
        pass
    return WorkspaceFileContent(content="Session deleted. Next WhatsApp message starts a fresh session.")


@router.post(
    "/{gateway_id}/workspace/send-trigger",
    response_model=WorkspaceFileContent,
)
async def send_trigger_message(
    gateway_id: UUID,
    payload: TriggerRequest,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> WorkspaceFileContent:
    """Send a trigger message to the main agent session (e.g. 'morning_briefing')."""
    gateway = await crud.get(session, Gateway, id=gateway_id)
    if not gateway or gateway.organization_id != ctx.organization.id:
        raise HTTPException(404, detail="Gateway not found.")
    config = gateway_client_config(gateway)
    session_key = GatewayAgentIdentity.session_key(gateway)
    await send_message(payload.message, session_key=session_key, config=config, deliver=True)
    return WorkspaceFileContent(content=f"Sent: {payload.message}")


@router.post(
    "/{gateway_id}/workspace/regenerate-leads",
    response_model=RegenerateLeadsResult,
)
async def regenerate_lead_prompts(
    gateway_id: UUID,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> RegenerateLeadsResult:
    """Regenerate and push SOUL.md for all board leads on this gateway."""
    from app.services.openclaw.lead_prompt import regenerate_lead_soul_md

    gateway = await crud.get(session, Gateway, id=gateway_id)
    if not gateway or gateway.organization_id != ctx.organization.id:
        raise HTTPException(404, detail="Gateway not found.")

    leads_result = await session.exec(
        select(Agent)
        .where(Agent.gateway_id == gateway_id)
        .where(col(Agent.is_board_lead).is_(True))
        .where(col(Agent.board_id).is_not(None))
    )
    leads = leads_result.all()

    updated, failed = 0, 0
    errors: list[str] = []
    for lead in leads:
        board = await crud.get(session, Board, id=lead.board_id)
        if board is None:
            failed += 1
            errors.append(f"Board not found for lead {lead.id}")
            continue
        try:
            await regenerate_lead_soul_md(lead, board, gateway, session)
            updated += 1
        except Exception as exc:  # noqa: BLE001
            failed += 1
            errors.append(f"{lead.name}: {exc!s}")

    return RegenerateLeadsResult(updated=updated, failed=failed, errors=errors)
