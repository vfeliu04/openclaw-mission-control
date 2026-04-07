"""Task generation and batch task creation endpoints."""

from __future__ import annotations

from typing import TYPE_CHECKING

from fastapi import APIRouter, Depends

from app.api.deps import get_board_for_user_write, require_user_auth
from app.core.config import settings
from app.db.session import get_session
from app.models.boards import Board
from app.models.tasks import Task
from app.models.task_dependencies import TaskDependency
from app.schemas.task_generation import TaskGenerationPreview, TaskGenerationRequest
from app.schemas.tasks import TaskCreate, TaskRead
from app.services.tags import replace_tags, validate_tag_ids
from app.services.task_generator import TaskGeneratorService

if TYPE_CHECKING:
    from sqlmodel.ext.asyncio.session import AsyncSession

router = APIRouter(prefix="/boards", tags=["task-generation"])

SESSION_DEP = Depends(get_session)
BOARD_WRITE_DEP = Depends(get_board_for_user_write)
USER_AUTH_DEP = Depends(require_user_auth)


@router.post("/{board_id}/generate-tasks", response_model=TaskGenerationPreview)
async def generate_tasks(
    payload: TaskGenerationRequest,
    board: Board = BOARD_WRITE_DEP,
    _auth: object = USER_AUTH_DEP,
) -> TaskGenerationPreview:
    """Generate a task breakdown preview from a plain-English goal prompt. Nothing is saved."""
    service = TaskGeneratorService(settings.gemini_api_key)
    tasks = await service.generate(payload.prompt, max_tasks=payload.max_tasks)
    return TaskGenerationPreview(tasks=tasks, prompt=payload.prompt)


@router.post("/{board_id}/tasks/batch", response_model=list[TaskRead])
async def batch_create_tasks(
    payloads: list[TaskCreate],
    board: Board = BOARD_WRITE_DEP,
    session: AsyncSession = SESSION_DEP,
    _auth: object = USER_AUTH_DEP,
) -> list[Task]:
    """Create multiple tasks in a single transaction. Returns all created tasks."""
    created: list[Task] = []
    for payload in payloads:
        data = payload.model_dump(exclude={"depends_on_task_ids", "tag_ids", "custom_field_values"})
        task = Task.model_validate(data)
        task.board_id = board.id
        session.add(task)
        await session.flush()
        tag_ids = await validate_tag_ids(
            session,
            organization_id=board.organization_id,
            tag_ids=list(payload.tag_ids),
        )
        await replace_tags(session, task_id=task.id, tag_ids=tag_ids)
        created.append(task)

    # Wire dependencies (all tasks now flushed and have IDs)
    for payload, task in zip(payloads, created):
        for dep_id in payload.depends_on_task_ids:
            session.add(TaskDependency(
                board_id=board.id,
                task_id=task.id,
                depends_on_task_id=dep_id,
            ))

    await session.commit()
    for task in created:
        await session.refresh(task)
    return created
