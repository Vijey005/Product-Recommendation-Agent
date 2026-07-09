"""
agent/models.py
───────────────
Pydantic v2 models for structured constraint extraction.

The LLM is instructed to populate these fields from conversation context.
All fields are Optional — the agent never crashes on sparse input.
"""

from __future__ import annotations

from typing import List, Optional
from pydantic import BaseModel, Field


class ProductConstraints(BaseModel):
    """
    Structured representation of a user's product preferences.
    Designed to work for laptops, smartphones, tablets, and other
    consumer electronics — extensible to other categories in later phases.
    """

    product_category: Optional[str] = Field(
        default=None,
        description=(
            "The type of product the user wants. "
            "E.g. 'laptop', 'smartphone', 'tablet', 'headphones', 'smartwatch'."
        ),
    )

    budget_min: Optional[float] = Field(
        default=None,
        description="Minimum acceptable price in INR (if user specifies a range).",
    )

    budget_max: Optional[float] = Field(
        default=None,
        description=(
            "Maximum budget in INR. Extract from phrases like 'under ₹50,000', "
            "'around ₹30,000', 'no more than 40000 rupees'."
        ),
    )

    primary_use_case: Optional[str] = Field(
        default=None,
        description=(
            "Primary intended use. "
            "E.g. 'gaming', 'video editing', 'college student', "
            "'business travel', 'photography', 'everyday use'."
        ),
    )

    hard_requirements: Optional[List[str]] = Field(
        default=None,
        description=(
            "Non-negotiable must-have features or specs. "
            "E.g. ['16GB RAM', 'OLED display', 'USB-C charging', 'MagSafe']."
        ),
    )

    preferred_brands: Optional[List[str]] = Field(
        default=None,
        description=(
            "Brands the user likes or prefers. "
            "E.g. ['Apple', 'Sony', 'Samsung', 'Dell', 'Lenovo']."
        ),
    )

    avoided_brands: Optional[List[str]] = Field(
        default=None,
        description="Brands the user explicitly dislikes or wants to avoid.",
    )

    form_factor: Optional[str] = Field(
        default=None,
        description=(
            "Size or portability preference. "
            "E.g. 'ultrabook', 'compact', 'large screen', '13-inch', 'foldable'."
        ),
    )

    operating_system: Optional[str] = Field(
        default=None,
        description=(
            "Preferred OS. "
            "E.g. 'Windows', 'macOS', 'Linux', 'Android', 'iOS', 'ChromeOS'."
        ),
    )

    performance_tier: Optional[str] = Field(
        default=None,
        description=(
            "General performance expectation. "
            "E.g. 'entry-level', 'mid-range', 'high-end', 'flagship', 'workstation'."
        ),
    )

    additional_notes: Optional[str] = Field(
        default=None,
        description=(
            "Any other relevant details that do not fit the above fields. "
            "E.g. 'must have a good camera', 'prefers matte finish', "
            "'uses it for streaming mostly'."
        ),
    )

    def filled_fields(self) -> List[str]:
        """Return the names of all fields that have been populated (not None)."""
        return [
            field
            for field, value in self.model_dump().items()
            if value is not None and value != []
        ]

    def missing_fields(self) -> List[str]:
        """Return the names of all fields that are still None or empty."""
        return [
            field
            for field, value in self.model_dump().items()
            if value is None or value == []
        ]
