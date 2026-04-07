"""Read and write workspace files for the main agent via gateway RPC."""

from __future__ import annotations

from app.models.gateways import Gateway
from app.services.openclaw.gateway_resolver import gateway_client_config
from app.services.openclaw.gateway_rpc import OpenClawGatewayError, openclaw_call

MAIN_AGENT_ID = "main"


def _extract_file_content(payload: object) -> str | None:
    """Parse the file content from an agents.files.get RPC response."""
    if isinstance(payload, str):
        return payload
    if isinstance(payload, dict):
        content = payload.get("content")
        if isinstance(content, str):
            return content
        file_obj = payload.get("file")
        if isinstance(file_obj, dict):
            nested = file_obj.get("content")
            if isinstance(nested, str):
                return nested
    return None


async def read_workspace_file(gateway: Gateway, filename: str) -> str | None:
    """Return file content from the main agent's workspace, or None if unavailable."""
    config = gateway_client_config(gateway)
    try:
        result = await openclaw_call(
            "agents.files.get",
            {"agentId": MAIN_AGENT_ID, "name": filename},
            config=config,
        )
        return _extract_file_content(result)
    except OpenClawGatewayError:
        return None


async def write_workspace_file(gateway: Gateway, filename: str, content: str) -> None:
    """Write content to a file in the main agent's workspace via RPC."""
    config = gateway_client_config(gateway)
    await openclaw_call(
        "agents.files.set",
        {"agentId": MAIN_AGENT_ID, "name": filename, "content": content},
        config=config,
    )
