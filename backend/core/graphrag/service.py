"""
Top-level GraphRAG orchestrator.

ChatService.answer() is the single entry point for the chatbot pipeline:

  1. classify intent
  2. (if HEADLINE_OPPORTUNITY) resolve entities
  3. retrieve subgraph
  4. synthesize cited answer
  5. on any meaningful failure, fall back to the configured base LLM

This module is the only one that knows about the fallback contract.
The classifier, resolver, retriever, and synthesizer all stay focused
on their specific job and surface failures (or low confidence) as
data, not exceptions.

Two LLMs are passed in:
  - base_llm:  used for classification, synthesis, and fallback chat
  - graph_llm: same in CLI; could differ in production if you want
              different deployments for grounded vs ungrounded answers

In FinDash-web this is wired as:
  base_llm  = AzureChatLLM(deployment=settings.AZURE_OPENAI_DEPLOYMENT)
  graph_llm = AzureChatLLM(deployment=settings.AZURE_OPENAI_DEPLOYMENT)
(The same deployment unless product wants to differentiate.)

Confidence thresholds for fallback are intentionally conservative:
the principle is that a confident but limited graph answer is better
than a verbose ungrounded answer, but a weak graph answer is worse
than a clean fallback.
"""

from __future__ import annotations

import time
from dataclasses import dataclass

from .intent import IntentClassifier
from .llm import ChatLLM, LLMError
from .resolver import EntityResolver
from .retriever import SubgraphRetriever
from .synthesizer import Synthesizer
from .types import (
    ChatResponse,
    Citation,
    IntentType,
    RetrievalSummary,
)


# Below this retrieval confidence we fall back to the base LLM rather
# than show a thin graph answer.
MIN_RETRIEVAL_CONFIDENCE_FOR_GRAPH = 0.4

# Below this intent classification confidence we treat the message as
# UNSUPPORTED even if the classifier emitted a recognized intent.
MIN_INTENT_CONFIDENCE = 0.5


@dataclass
class ChatServiceConfig:
    """Tunable thresholds for service-layer fallback decisions."""
    min_retrieval_confidence: float = MIN_RETRIEVAL_CONFIDENCE_FOR_GRAPH
    min_intent_confidence: float = MIN_INTENT_CONFIDENCE


# ---------------------------------------------------------------------------
# Service
# ---------------------------------------------------------------------------

class ChatService:
    """Orchestrates the GraphRAG pipeline with graceful fallback."""

    def __init__(
        self,
        *,
        classifier: IntentClassifier,
        resolver: EntityResolver,
        retriever: SubgraphRetriever,
        synthesizer: Synthesizer,
        base_llm: ChatLLM,
        config: ChatServiceConfig | None = None,
    ):
        self._classifier = classifier
        self._resolver = resolver
        self._retriever = retriever
        self._synthesizer = synthesizer
        self._base_llm = base_llm
        self._config = config or ChatServiceConfig()

    async def answer(self, message: str) -> ChatResponse:
        """Answer one user message end-to-end.

        Always returns a ChatResponse. Never raises for ordinary
        pipeline failures - they translate into fallback responses
        with `used_graph=False` and a `fallback_reason`.
        """
        t_start = time.time()

        # Step 1: classify intent
        intent = await self._classifier.classify(message)

        # Step 2: gate on intent + confidence
        if intent.intent == IntentType.UNSUPPORTED:
            return await self._fallback(
                message,
                reason=f"intent unsupported ({intent.reasoning or 'no reason given'})",
                intent_for_summary=intent.intent,
                t_start=t_start,
            )

        if intent.confidence < self._config.min_intent_confidence:
            return await self._fallback(
                message,
                reason=f"low intent confidence ({intent.confidence:.2f})",
                intent_for_summary=intent.intent,
                t_start=t_start,
            )

        # Step 3: resolve entities (no-op for COMPANY_RISK_PROFILE)
        try:
            resolution = await self._resolver.resolve(intent)
        except Exception as exc:
            return await self._fallback(
                message,
                reason=f"entity resolver error: {exc}",
                intent_for_summary=intent.intent,
                t_start=t_start,
            )

        # Step 4: retrieve subgraph
        try:
            retrieval = await self._retriever.retrieve(intent, resolution)
        except Exception as exc:
            return await self._fallback(
                message,
                reason=f"retriever error: {exc}",
                intent_for_summary=intent.intent,
                t_start=t_start,
            )

        # Step 5: gate on retrieval confidence
        if retrieval.confidence < self._config.min_retrieval_confidence:
            return await self._fallback(
                message,
                reason=f"weak retrieval (confidence={retrieval.confidence:.2f}, notes={'; '.join(retrieval.notes)})",
                intent_for_summary=intent.intent,
                t_start=t_start,
            )

        # Step 6: synthesize
        try:
            answer_text, citations = await self._synthesizer.synthesize(message, retrieval)
        except LLMError as exc:
            return await self._fallback(
                message,
                reason=f"synthesizer LLM error: {exc}",
                intent_for_summary=intent.intent,
                t_start=t_start,
            )

        elapsed_ms = int((time.time() - t_start) * 1000)
        return ChatResponse(
            answer=answer_text,
            citations=citations,
            retrieval_summary=RetrievalSummary(
                intent=intent.intent,
                results_returned=len(citations),
                elapsed_ms=elapsed_ms,
                notes=retrieval.notes,
            ),
            used_graph=True,
            fallback_reason="",
        )

    # -----------------------------------------------------------------
    # Fallback path
    # -----------------------------------------------------------------

    async def _fallback(
        self,
        message: str,
        *,
        reason: str,
        intent_for_summary: IntentType,
        t_start: float,
    ) -> ChatResponse:
        """Run the configured base LLM without graph grounding.

        We surface a short user-facing note so the user understands
        graph retrieval did not apply, then concatenate the base LLM's
        answer. The note is intentionally non-technical.
        """
        try:
            base_answer = await self._base_llm.complete(
                system=BASE_LLM_FALLBACK_SYSTEM_PROMPT,
                user=message,
                json_mode=False,
            )
            base_answer = base_answer.strip()
        except LLMError as exc:
            base_answer = (
                "I'm having trouble reaching the language model right now. "
                f"Please try again. (technical detail: {exc})"
            )

        # Soft prefix: tells the user the graph didn't engage. Production
        # UI may suppress this if the user is on the public free-tier
        # path (where graph never engages by definition); the note is
        # still useful for authenticated users hitting an off-topic
        # question.
        prefix = (
            "I don't have enough filing-graph coverage to answer that from SEC filings. "
            "Here's a general response instead:\n\n"
        )
        full_answer = prefix + base_answer

        elapsed_ms = int((time.time() - t_start) * 1000)
        return ChatResponse(
            answer=full_answer,
            citations=[],
            retrieval_summary=RetrievalSummary(
                intent=intent_for_summary,
                results_returned=0,
                elapsed_ms=elapsed_ms,
                notes=[reason],
            ),
            used_graph=False,
            fallback_reason=reason,
        )


BASE_LLM_FALLBACK_SYSTEM_PROMPT = """You are a financial research assistant. The user asked a question that we couldn't ground in our SEC filings knowledge graph - either because the question is general, the entities involved are not in our coverage, or because graph retrieval was not confident enough.

Provide a useful, professional response based on general knowledge. Be honest about limitations:
  - If the question requires real-time data, say so.
  - If you're uncertain, say so.
  - Do not invent specific filing citations or company numbers.

Keep responses concise and direct."""
