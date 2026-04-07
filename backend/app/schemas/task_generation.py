"""Schemas for AI task generation API payloads."""

from __future__ import annotations

from sqlmodel import Field, SQLModel

from app.schemas.tasks import DifficultyLevel


class TaskGenerationRequest(SQLModel):
    """Payload for generating a task breakdown from a goal prompt."""

    prompt: str = Field(description="Plain-English goal description.")
    max_tasks: int = Field(default=15, ge=1, le=20)


class TaskGeneratedTask(SQLModel):
    """A single task returned in a generation preview."""

    title: str
    description: str | None = None
    difficulty: DifficultyLevel = "auto"
    suggested_skill_tags: list[str] = Field(default_factory=list)
    depends_on_indices: list[int] = Field(
        default_factory=list,
        description="0-indexed references to other tasks in this preview that this task depends on.",
    )


class TaskGenerationPreview(SQLModel):
    """Preview payload returned by the generate-tasks endpoint."""

    tasks: list[TaskGeneratedTask]
    prompt: str
