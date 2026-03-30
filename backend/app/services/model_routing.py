"""Maps task difficulty tiers to openclaw model identifiers."""

from __future__ import annotations

from typing import Literal

DifficultyTier = Literal["easy", "medium", "hard"]

# Openclaw model identifiers for each difficulty tier.
# Update these strings if the gateway model IDs change.
_DIFFICULTY_MODEL_MAP: dict[DifficultyTier, str] = {
    "easy": "anthropic/claude-haiku-4-5",
    "medium": "anthropic/claude-sonnet-4-6",
    "hard": "anthropic/claude-opus-4-6",
}


def resolve_model_for_difficulty(difficulty: DifficultyTier) -> str:
    """Return the openclaw model string for the given difficulty tier."""
    return _DIFFICULTY_MODEL_MAP[difficulty]
