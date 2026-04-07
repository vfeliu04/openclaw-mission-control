"""Schemas for gateway channel status responses."""

from __future__ import annotations

from sqlmodel import Field, SQLModel


class ChannelAccountStatus(SQLModel):
    """State snapshot for a single account within a channel."""

    account_id: str
    name: str | None = None
    enabled: bool | None = None
    configured: bool | None = None
    linked: bool | None = None
    running: bool | None = None
    connected: bool | None = None
    reconnect_attempts: int | None = None
    last_connected_at: int | None = None  # Unix ms
    last_error: str | None = None
    health_state: str | None = None
    last_start_at: int | None = None  # Unix ms
    last_stop_at: int | None = None  # Unix ms
    last_inbound_at: int | None = None  # Unix ms
    last_outbound_at: int | None = None  # Unix ms
    busy: bool | None = None


class ChannelStatus(SQLModel):
    """Aggregated status for one channel (e.g. whatsapp, imessage)."""

    id: str
    label: str
    detail_label: str | None = None
    system_image: str | None = None
    accounts: list[ChannelAccountStatus] = Field(default_factory=list)
    default_account_id: str | None = None


class GatewayChannelsStatus(SQLModel):
    """Full channels status payload returned by the proxy endpoint."""

    ts: int
    channels: list[ChannelStatus] = Field(default_factory=list)
    error: str | None = None  # Set when gateway is unreachable
