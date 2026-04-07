"""AI task generation service using Gemini Flash."""

from __future__ import annotations

import json
import logging

import google.generativeai as genai

from app.schemas.task_generation import TaskGeneratedTask

logger = logging.getLogger(__name__)

_SYSTEM = """You are a task planning assistant. Given a goal description, break it into concrete, actionable tasks a software agent can execute.

Return ONLY a valid JSON array. Each element must have these exact keys:
- "title": string — short, action-oriented (max 80 chars)
- "description": string — 2-3 sentences of detail (null if obvious)
- "difficulty": "easy" | "medium" | "hard"
- "suggested_skill_tags": array of strings from: ["frontend", "backend", "data", "cybersecurity", "devops", "research", "design"]
- "depends_on_indices": array of 0-based integers referencing earlier tasks this depends on

Return ONLY the JSON array. No markdown, no explanation, no code fences."""


class TaskGeneratorService:
    """Generate a task breakdown from a goal prompt using Gemini Flash."""

    MODEL = "gemini-2.5-flash"

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def generate(
        self,
        prompt: str,
        max_tasks: int = 15,
    ) -> list[TaskGeneratedTask]:
        """Return a list of generated tasks. Returns [] on any failure."""
        if not self._api_key:
            logger.warning("No GEMINI_API_KEY; cannot generate tasks.")
            return []
        try:
            genai.configure(api_key=self._api_key)
            model = genai.GenerativeModel(self.MODEL, system_instruction=_SYSTEM)
            response = await model.generate_content_async(
                f"Goal: {prompt.strip()}\n\nGenerate up to {max_tasks} tasks.",
                generation_config=genai.GenerationConfig(max_output_tokens=4096),
            )
            raw = response.text.strip()
            # Strip markdown code fences if present
            if raw.startswith("```"):
                raw = raw.split("\n", 1)[1].rsplit("```", 1)[0].strip()
            data = json.loads(raw)
            if not isinstance(data, list):
                raise ValueError("Expected JSON array")
            return [TaskGeneratedTask.model_validate(item) for item in data[:max_tasks]]
        except Exception:
            logger.exception("Task generation failed.")
            return []
