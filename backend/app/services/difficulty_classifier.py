"""LLM-based task difficulty classifier using Gemini Flash."""

from __future__ import annotations

import logging
from typing import Literal

import google.generativeai as genai

logger = logging.getLogger(__name__)

DifficultyTier = Literal["easy", "medium", "hard"]

_CLASSIFIER_PROMPT = (
    "You are a task difficulty classifier. "
    "Given a task title and optional description, respond with exactly one word: "
    "easy, medium, or hard. "
    "easy = simple, well-defined, single-step tasks (e.g. fix a typo, rename a variable, write a short summary). "
    "medium = multi-step tasks requiring moderate reasoning (e.g. implement a feature, debug an issue, write a report). "
    "hard = complex, open-ended, or architecturally significant tasks "
    "(e.g. design a system, refactor a module, security audit, research and synthesise). "
    "Respond with only the single word. No punctuation, no explanation.\n\n"
)


class DifficultyClassifierService:
    """Classify task difficulty using Gemini Flash."""

    MODEL = "gemini-2.5-flash"
    FALLBACK: DifficultyTier = "medium"

    def __init__(self, api_key: str) -> None:
        self._api_key = api_key

    async def classify(
        self,
        title: str,
        description: str | None = None,
    ) -> DifficultyTier:
        """Return 'easy', 'medium', or 'hard'. Falls back to 'medium' on any error."""
        if not self._api_key:
            logger.debug("No GEMINI_API_KEY configured; using fallback difficulty 'medium'.")
            return self.FALLBACK

        content = f"Task: {title}"
        if description and description.strip():
            content += f"\nDescription: {description.strip()[:500]}"

        try:
            genai.configure(api_key=self._api_key)
            model = genai.GenerativeModel(self.MODEL)
            response = await model.generate_content_async(
                _CLASSIFIER_PROMPT + content,
                generation_config=genai.GenerationConfig(max_output_tokens=5),
            )
            raw = response.text.strip().lower()
            if raw in ("easy", "medium", "hard"):
                return raw  # type: ignore[return-value]
            logger.warning("Classifier returned unexpected value %r; using fallback.", raw)
            return self.FALLBACK
        except Exception:
            logger.exception("Difficulty classification failed; using fallback 'medium'.")
            return self.FALLBACK
