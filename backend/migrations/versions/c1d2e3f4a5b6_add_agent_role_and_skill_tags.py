"""Add agent_role and skill_tags columns to agents.

Revision ID: c1d2e3f4a5b6
Revises: b1c2d3e4f5a6
Create Date: 2026-03-31 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "c1d2e3f4a5b6"
down_revision = "b1c2d3e4f5a6"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add agent_role and skill_tags columns to agents."""
    op.add_column(
        "agents",
        sa.Column(
            "agent_role",
            sa.String(),
            nullable=False,
            server_default="specialist",
        ),
    )
    op.add_column(
        "agents",
        sa.Column(
            "skill_tags",
            sa.JSON(),
            nullable=False,
            server_default="[]",
        ),
    )
    op.create_index("ix_agents_agent_role", "agents", ["agent_role"])


def downgrade() -> None:
    """Remove agent_role and skill_tags columns from agents."""
    op.drop_index("ix_agents_agent_role", table_name="agents")
    op.drop_column("agents", "skill_tags")
    op.drop_column("agents", "agent_role")
