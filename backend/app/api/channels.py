"""Gateway channel status proxy endpoint."""

from __future__ import annotations

from time import time
from typing import TYPE_CHECKING
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query

from app.api.deps import require_org_admin
from app.core.auth import get_auth_context
from app.db import crud
from app.db.session import get_session
from app.models.gateways import Gateway
from app.schemas.channels import ChannelAccountStatus, ChannelStatus, GatewayChannelsStatus
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, openclaw_call

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

    from app.services.organizations import OrganizationContext

router = APIRouter(prefix="/gateways", tags=["channels"])
SESSION_DEP = Depends(get_session)
AUTH_DEP = Depends(get_auth_context)
ORG_ADMIN_DEP = Depends(require_org_admin)
PROBE_QUERY = Query(default=False)


@router.get("/{gateway_id}/channels", response_model=GatewayChannelsStatus)
async def get_gateway_channels(
    gateway_id: UUID,
    probe: bool = PROBE_QUERY,
    session: AsyncSession = SESSION_DEP,
    ctx: OrganizationContext = ORG_ADMIN_DEP,
) -> GatewayChannelsStatus:
    """Proxy channels.status RPC from the openclaw gateway."""
    gateway = await crud.get(session, Gateway, id=gateway_id)
    if not gateway or gateway.organization_id != ctx.organization.id:
        raise HTTPException(404, detail="Gateway not found.")
    config = gateway_client_config(gateway)
    try:
        raw = await openclaw_call("channels.status", {"probe": probe}, config=config)
    except OpenClawGatewayError as exc:
        return GatewayChannelsStatus(ts=int(time() * 1000), error=str(exc))

    if not isinstance(raw, dict):
        return GatewayChannelsStatus(ts=int(time() * 1000), error="Unexpected gateway response.")

    channel_order: list[str] = raw.get("channelOrder") or []
    channel_labels: dict[str, str] = raw.get("channelLabels") or {}
    channel_detail_labels: dict[str, str] = raw.get("channelDetailLabels") or {}
    channel_system_images: dict[str, str] = raw.get("channelSystemImages") or {}
    channel_accounts_raw: dict[str, list[dict]] = raw.get("channelAccounts") or {}
    channel_default_id: dict[str, str] = raw.get("channelDefaultAccountId") or {}

    channels: list[ChannelStatus] = []
    for ch_id in channel_order:
        accounts = [
            ChannelAccountStatus(
                account_id=acc.get("accountId", ""),
                name=acc.get("name"),
                enabled=acc.get("enabled"),
                configured=acc.get("configured"),
                linked=acc.get("linked"),
                running=acc.get("running"),
                connected=acc.get("connected"),
                reconnect_attempts=acc.get("reconnectAttempts"),
                last_connected_at=acc.get("lastConnectedAt"),
                last_error=acc.get("lastError"),
                health_state=acc.get("healthState"),
                last_start_at=acc.get("lastStartAt"),
                last_stop_at=acc.get("lastStopAt"),
                last_inbound_at=acc.get("lastInboundAt"),
                last_outbound_at=acc.get("lastOutboundAt"),
                busy=acc.get("busy"),
            )
            for acc in (channel_accounts_raw.get(ch_id) or [])
        ]
        channels.append(
            ChannelStatus(
                id=ch_id,
                label=channel_labels.get(ch_id, ch_id),
                detail_label=channel_detail_labels.get(ch_id),
                system_image=channel_system_images.get(ch_id),
                accounts=accounts,
                default_account_id=channel_default_id.get(ch_id),
            )
        )

    return GatewayChannelsStatus(ts=raw.get("ts", int(time() * 1000)), channels=channels)
