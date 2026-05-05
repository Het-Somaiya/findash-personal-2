"""
Intent classification for the chatbot pipeline.

The classifier asks the LLM to map a user message into a structured
IntentResult. It only emits intents we have retrievers for in v1:
COMPANY_RISK_PROFILE and HEADLINE_OPPORTUNITY. Any other input is
classified as UNSUPPORTED so the service layer can fall back to the
configured base LLM.
"""

from __future__ import annotations

import re

from .llm import ChatLLM, LLMError, parse_json_response
from .types import Direction, IntentResult, IntentType


SYSTEM_PROMPT = """You are an intent classifier for a financial research assistant grounded in SEC filings (10-K and 10-Q risk factor disclosures).

You only recognize two intents that can be answered from the SEC filing knowledge graph:

1. COMPANY_RISK_PROFILE
   The user is asking about the disclosed risks, exposures, or strategic concerns of one or more specific public companies.
   Examples:
     "What are NVDA's biggest risks?"
     "Tell me about Apple's exposures in their latest 10-K"
     "How risky is JPMorgan right now according to filings?"

2. HEADLINE_OPPORTUNITY
   The user is sharing a news event, headline, regulatory development, market scenario, or disclosure theme, and asking which companies are exposed, affected, benefiting, or how companies discuss/handle it.
   Examples:
     "China imposes new rare earth export restrictions. Which companies are at risk?"
     "Who benefits if the FDA approves more weight-loss drugs?"
     "New EU AI Act phase-in. Which companies are most exposed?"
     "How are companies handling export controls?"

Anything else is UNSUPPORTED. This includes:
   - General financial advice
   - Stock price predictions
   - Personal finance questions
   - Math, weather, or general chat

Return STRICT JSON with this exact shape:

{
  "intent": "COMPANY_RISK_PROFILE" | "HEADLINE_OPPORTUNITY" | "UNSUPPORTED",
  "tickers": [string],
  "entity_phrases": [string],
  "concept_phrases": [string],
  "direction_filter": "POSITIVE" | "NEGATIVE" | "ANY",
  "confidence": number,
  "reasoning": string
}

Rules:
- Tickers are uppercase, no $ prefix, no surrounding text. Resolve common company names ("Apple" -> "AAPL", "Microsoft" -> "MSFT", "Pfizer" -> "PFE").
- Coverage is checked later by the retriever; do not classify a company question as UNSUPPORTED just because you are unsure whether the company is covered.
- entity_phrases captures specific named things from the user's text. Do not invent entities.
- concept_phrases captures disclosure themes or regulatory topics from the user's text, such as "export controls", "tariffs", "data privacy", or "supply chain".
- direction_filter defaults to NEGATIVE for "exposed", "at risk", "hurt by", "vulnerable to". POSITIVE for "benefit", "gain", "winners". ANY when the user asks for both sides.
- For UNSUPPORTED, all array fields can be empty.
- Output ONLY the JSON object. No prose, no markdown fences, no preamble."""


USER_PROMPT_TEMPLATE = """User message:

{message}

Classify the intent and return the JSON object."""


VALID_INTENTS = {it.value for it in IntentType}
VALID_DIRECTIONS = {d.value for d in Direction}
TICKER_RE = re.compile(r"^[A-Z0-9][A-Z0-9.-]{0,7}$")


class IntentClassifier:
    """LLM-driven intent classifier."""

    def __init__(self, llm: ChatLLM):
        self._llm = llm

    async def classify(self, message: str) -> IntentResult:
        """Classify one user message. Never raises."""

        message = message.strip()
        if not message:
            return IntentResult(
                intent=IntentType.UNSUPPORTED,
                raw_query=message,
                reasoning="empty message",
            )

        try:
            raw = await self._llm.complete(
                system=SYSTEM_PROMPT,
                user=USER_PROMPT_TEMPLATE.format(message=message),
                json_mode=True,
            )
        except LLMError as exc:
            return IntentResult(
                intent=IntentType.UNSUPPORTED,
                raw_query=message,
                reasoning=f"llm error: {exc}",
            )

        try:
            data = parse_json_response(raw)
        except LLMError as exc:
            return IntentResult(
                intent=IntentType.UNSUPPORTED,
                raw_query=message,
                reasoning=f"unparseable output: {exc}",
            )

        return self._build_result(message, data)

    def _build_result(self, message: str, data: dict) -> IntentResult:
        """Convert a parsed dict into a validated IntentResult."""

        intent_str = str(data.get("intent", "")).strip().upper()
        if intent_str not in VALID_INTENTS:
            return IntentResult(
                intent=IntentType.UNSUPPORTED,
                raw_query=message,
                reasoning=f"unknown intent value: {intent_str!r}",
            )
        intent = IntentType(intent_str)

        tickers = self._coerce_string_list(data.get("tickers"))
        tickers = [t.strip().upper().removeprefix("$") for t in tickers if t and t.strip()]
        tickers = [t for t in tickers if TICKER_RE.match(t)]

        entity_phrases = self._coerce_string_list(data.get("entity_phrases"))
        entity_phrases = [p.strip() for p in entity_phrases if p and p.strip()]

        concept_phrases = self._coerce_string_list(data.get("concept_phrases"))
        concept_phrases = [p.strip() for p in concept_phrases if p and p.strip()]

        direction_str = str(data.get("direction_filter", "ANY")).strip().upper()
        if direction_str not in VALID_DIRECTIONS:
            direction_str = "ANY"
        direction = Direction(direction_str)

        confidence = self._coerce_float(data.get("confidence"), default=0.0)
        confidence = max(0.0, min(1.0, confidence))

        reasoning = str(data.get("reasoning", "")).strip()

        return IntentResult(
            intent=intent,
            raw_query=message,
            tickers=tickers,
            entity_phrases=entity_phrases,
            concept_phrases=concept_phrases,
            direction_filter=direction,
            confidence=confidence,
            reasoning=reasoning,
        )

    @staticmethod
    def _coerce_string_list(value) -> list[str]:
        if value is None:
            return []
        if isinstance(value, list):
            return [str(v) for v in value]
        if isinstance(value, str):
            return [value]
        return []

    @staticmethod
    def _coerce_float(value, *, default: float) -> float:
        if value is None:
            return default
        try:
            return float(value)
        except (TypeError, ValueError):
            return default
