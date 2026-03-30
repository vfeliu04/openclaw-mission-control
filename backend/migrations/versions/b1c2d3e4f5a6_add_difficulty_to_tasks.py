"""Add difficulty column to tasks.

Revision ID: b1c2d3e4f5a6
Revises: fa6e83f8d9a1
Create Date: 2026-03-30 00:00:00.000000
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "b1c2d3e4f5a6"
down_revision = "a9b1c2d3e4f7"
branch_labels = None
depends_on = None


def upgrade() -> None:
    """Add difficulty column with default 'auto' to tasks."""
    op.add_column(
        "tasks",
        sa.Column(
            "difficulty",
            sa.String(),
            nullable=False,
            server_default="auto",
        ),
    )
    op.create_index("ix_tasks_difficulty", "tasks", ["difficulty"])


def downgrade() -> None:
    """Remove difficulty column from tasks."""
    op.drop_index("ix_tasks_difficulty", table_name="tasks")
    op.drop_column("tasks", "difficulty")
