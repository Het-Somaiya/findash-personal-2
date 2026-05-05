"""
Async Azure OpenAI LLM adapter for GraphRAG.

This module keeps the same ChatLLM protocol and JSON parser contract as the
filing-intel-engine local chatbot, but reads Azure configuration from Django
settings instead of environment variables.
"""

from __future__ import annotations

import json
from typing import Protocol

from django.conf import settings
from openai import AsyncAzureOpenAI


class LLMError(Exception):
    """Raised when an LLM call fails in a way the caller should handle."""


class ChatLLM(Protocol):
    """Minimal async chat completion interface."""

    async def complete(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
    ) -> str: ...

    @property
    def model_name(self) -> str: ...


class AzureChatLLM:
    """Azure OpenAI chat client used by the Django GraphRAG path."""

    def __init__(self, *, timeout_seconds: float = 120.0):
        self._deployment = settings.AZURE_OPENAI_DEPLOYMENT
        self._client = AsyncAzureOpenAI(
            api_key=settings.AZURE_OPENAI_API_KEY,
            azure_endpoint=settings.AZURE_OPENAI_ENDPOINT,
            api_version=settings.AZURE_OPENAI_API_VERSION,
            timeout=timeout_seconds,
        )

    @property
    def model_name(self) -> str:
        return self._deployment

    async def complete(
        self,
        system: str,
        user: str,
        *,
        json_mode: bool = False,
    ) -> str:
        """Single-turn completion."""

        kwargs = {}
        if json_mode:
            kwargs["response_format"] = {"type": "json_object"}

        try:
            response = await self._client.chat.completions.create(
                model=self._deployment,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.2,
                max_tokens=2048,
                **kwargs,
            )
        except Exception as exc:
            raise LLMError(f"Azure OpenAI request failed: {exc}") from exc

        try:
            content = response.choices[0].message.content
            return (content or "").strip()
        except (AttributeError, IndexError, TypeError) as exc:
            raise LLMError(f"Unexpected Azure OpenAI response shape: {response}") from exc


def parse_json_response(raw: str) -> dict:
    """Parse an LLM response that should be JSON."""

    raw = raw.strip()
    try:
        return json.loads(raw)
    except json.JSONDecodeError:
        pass

    if raw.startswith("```"):
        first_nl = raw.find("\n")
        if first_nl != -1:
            inner = raw[first_nl + 1 :]
            if inner.endswith("```"):
                inner = inner[:-3]
            try:
                return json.loads(inner.strip())
            except json.JSONDecodeError:
                pass

    start = raw.find("{")
    end = raw.rfind("}")
    if start != -1 and end != -1 and end > start:
        candidate = raw[start : end + 1]
        try:
            return json.loads(candidate)
        except json.JSONDecodeError as exc:
            raise LLMError(f"Could not parse JSON from LLM response: {exc}") from exc

    raise LLMError(f"No JSON object found in LLM response: {raw[:200]!r}")
