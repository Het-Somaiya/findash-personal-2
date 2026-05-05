"""
Answer synthesis from retrieval results.

The synthesizer takes a structured RetrievalResult plus the user's
original question and produces a ChatResponse with:
  - A markdown-friendly answer string with [CITATION_N] placeholders
  - A parallel list of Citation objects keyed by id="CITATION_N"

The UI replaces placeholders with interactive cards. Plain markdown
rendering also works without UI support; users see [CITATION_1] etc.
inline alongside the prose.

Design choices:

  - One synthesizer for all supported intents. Intent-specific
    formatting lives in the prompt template construction, not in
    separate methods. Cleaner because the LLM is doing the heavy
    lifting; we just hand it the right context.

  - The LLM only sees facts that came from retrieval. We do not pass
    free-form context, the user's question alone, or unrelated
    knowledge. This is the GraphRAG discipline: every claim in the
    answer must be groundable to a Mention we retrieved.

  - Citations are pre-numbered before the LLM call. The LLM sees
    "Mention #1", "Mention #2", etc. in the context and is told to
    cite them with [CITATION_1], [CITATION_2]. This is more reliable
    than asking the LLM to invent citation IDs.

  - Synthesis errors fall through to a plaintext answer. If the LLM
    fails entirely we still return the retrieval data formatted as a
    structured fallback so the user gets something useful. The service
    layer catches LLMError separately for its fallback path.
"""

from __future__ import annotations

import re

from .llm import ChatLLM, LLMError
from .types import (
    Citation,
    CompanyRiskProfile,
    Direction,
    HeadlineOpportunityResult,
    IntentType,
    MentionRow,
    RetrievalResult,
)


SYNTHESIS_SYSTEM_PROMPT = """You are a financial research assistant grounded in SEC filings. Your job is to answer the user's question using ONLY the retrieval results provided.

Rules:
1. Every factual claim in your answer MUST be followed by a citation tag in the form [CITATION_N], referring to one of the numbered mentions in the retrieval context.
2. Do NOT invent facts, framings, or evidence not present in the retrieval results.
3. Do NOT cite mentions that don't support your specific claim.
3a. Use ONLY citation tags that appear in the retrieval context. Never write a citation number that was not provided.
3b. Aggregate overview lines are for orientation only. Do not cite them as evidence unless a numbered mention supports the same claim.
3c. Refer to companies by ticker symbol only. Do not expand tickers into company names unless the name appears in the retrieval context.
4. If the retrieval results are insufficient to answer fully, say so explicitly and answer what you can.
5. Write in clear, professional prose. Use markdown for structure (headings, bullet points where genuinely useful). Keep your response focused and free of filler.
6. Do NOT include a separate "Sources" or "References" section. Citations are inline only; the UI renders them.
7. Do NOT use phrases like "according to the retrieval results" or "based on the data provided". Speak directly: "NVDA discloses ..." not "According to the data, NVDA discloses ...".
8. Quote evidence sparingly. Prefer paraphrasing the framing, citing the source mention. Direct quotes are appropriate when the original wording carries weight (regulatory phrasing, specific numerical disclosures)."""


# ---------------------------------------------------------------------------
# Public entry point
# ---------------------------------------------------------------------------

class Synthesizer:
    """LLM-driven answer composer with [CITATION_N] grounding."""

    def __init__(self, llm: ChatLLM):
        self._llm = llm

    async def synthesize(
        self,
        question: str,
        retrieval: RetrievalResult,
    ) -> tuple[str, list[Citation]]:
        """Produce (answer_text, citations) for the given retrieval result.

        Returns a tuple rather than a ChatResponse because the service
        layer is the one that knows about used_graph / fallback_reason
        and constructs the final ChatResponse.

        Raises LLMError if the underlying LLM call fails. The service
        layer catches and falls back.
        """
        # Build numbered citation pool from the mentions surfaced by retrieval
        mentions = self._collect_mentions(retrieval)
        citations = [self._build_citation(idx, mention) for idx, mention in enumerate(mentions, start=1)]

        if not mentions:
            # No mentions to cite. Generate an honest "I don't have data" answer
            # without invoking the LLM.
            return self._empty_response(retrieval), []

        context_block = self._format_context(retrieval, mentions)

        user_prompt = f"""User question:

{question}

Retrieval context (use ONLY these facts; cite with [CITATION_N]):

{context_block}

Write your answer now. Cite every factual claim."""

        answer = await self._llm.complete(
            system=SYNTHESIS_SYSTEM_PROMPT,
            user=user_prompt,
            json_mode=False,
        )
        return self._remove_invalid_citation_tags(answer.strip(), len(citations)), citations

    # -----------------------------------------------------------------
    # Mention collection - intent dispatch
    # -----------------------------------------------------------------

    def _collect_mentions(self, retrieval: RetrievalResult) -> list[MentionRow]:
        """Pull MentionRow list out of whichever payload is populated."""
        if retrieval.intent == IntentType.COMPANY_RISK_PROFILE and retrieval.company_risk_profile:
            return retrieval.company_risk_profile.sample_mentions
        if retrieval.intent == IntentType.HEADLINE_OPPORTUNITY and retrieval.headline_opportunity:
            return retrieval.headline_opportunity.sample_mentions
        return []

    # -----------------------------------------------------------------
    # Context formatting
    # -----------------------------------------------------------------

    def _format_context(
        self,
        retrieval: RetrievalResult,
        mentions: list[MentionRow],
    ) -> str:
        """Build the context block the LLM sees alongside the question.

        Includes:
          - intent-specific summary (concept aggregates, company aggregates)
          - numbered mentions with framing, evidence, ticker, period
        """
        sections: list[str] = []

        if retrieval.intent == IntentType.COMPANY_RISK_PROFILE and retrieval.company_risk_profile:
            sections.append(self._format_company_summary(retrieval.company_risk_profile))
        elif retrieval.intent == IntentType.HEADLINE_OPPORTUNITY and retrieval.headline_opportunity:
            sections.append(self._format_headline_summary(retrieval.headline_opportunity))

        sections.append("Mentions available for citation:")
        for idx, m in enumerate(mentions, start=1):
            sections.append(self._format_mention(idx, m))

        return "\n\n".join(sections)

    def _format_company_summary(self, payload: CompanyRiskProfile) -> str:
        lines = [
            f"Company: {payload.ticker}",
            f"Latest 10-K period: {payload.latest_period}",
            "Top concept summaries are orientation only. Use the numbered mentions below as the only citation evidence.",
            "",
            "Top concepts in latest 10-K:",
        ]
        for c in payload.concept_summaries:
            framing_preview = "; ".join(c.sample_framings[:2]) if c.sample_framings else ""
            lines.append(
                f"  - {c.concept_id} ({c.category or 'N/A'}): "
                f"{c.mention_count} mentions, {c.high_magnitude_count} HIGH magnitude"
                + (f" — e.g., {framing_preview}" if framing_preview else "")
            )
        return "\n".join(lines)

    def _format_headline_summary(self, payload: HeadlineOpportunityResult) -> str:
        direction_label = self._direction_label(payload.direction_filter)
        entity_names = ", ".join(e.canonical_name for e in payload.matched_entities)
        theme_names = ", ".join(payload.theme_phrases)
        top_tickers = ", ".join(cs.ticker for cs in payload.company_summaries)
        lines = [
            f"Requested direction: {direction_label}",
            "Retrieval basis: disclosed filing exposure to the resolved entities, without filtering by mention direction.",
            f"Resolved entities from headline: {entity_names or 'None'}",
            f"Theme phrases searched: {theme_names or 'None'}",
            f"Top companies with matching graph exposure: {top_tickers}",
            "Use the numbered mentions below as the only citation evidence.",
        ]
        if payload.direction_filter == Direction.POSITIVE:
            lines.append(
                "Important: these filings do not directly identify beneficiaries. "
                "Do not treat companies with low or absent exposure as beneficiaries. "
                "If the user asks who benefits, state that the graph can ground "
                "exposure, not beneficiary identification, unless a numbered mention "
                "directly supports a benefit claim."
            )
        return "\n".join(lines)

    def _format_mention(self, idx: int, m: MentionRow) -> str:
        return (
            f"[CITATION_{idx}]\n"
            f"  Ticker: {m.ticker}\n"
            f"  Period: {m.period}\n"
            f"  Section: {m.section}\n"
            f"  Concept: {m.concept_id}\n"
            f"  Direction: {m.direction}\n"
            f"  Magnitude: {m.magnitude}\n"
            f"  Framing: {m.framing}\n"
            f"  Evidence: {m.evidence}"
        )

    @staticmethod
    def _direction_label(direction: Direction) -> str:
        if direction == Direction.POSITIVE:
            return "POSITIVE (user is asking about potential beneficiaries)"
        if direction == Direction.NEGATIVE:
            return "NEGATIVE (user is asking about exposed companies)"
        return "ANY (user is asking for general handling or exposure)"

    # -----------------------------------------------------------------
    # Citation construction
    # -----------------------------------------------------------------

    @staticmethod
    def _build_citation(idx: int, m: MentionRow) -> Citation:
        return Citation(
            id=f"CITATION_{idx}",
            ticker=m.ticker,
            period=m.period,
            accession=m.accession,
            section=m.section,
            concept_id=m.concept_id,
            framing=m.framing,
            evidence=m.evidence,
            source_url=Synthesizer._sec_url_for_accession(m.accession),
        )

    @staticmethod
    def _sec_url_for_accession(accession: str) -> str:
        """Best-effort EDGAR URL for an accession.

        SEC accessions in the canonical 18-char form (NNNNNNNNNN-YY-NNNNNN)
        map to a deterministic EDGAR URL pattern. We construct the URL even
        though the specific document filename inside the index may vary.
        The returned URL points to the filing index page where users can
        find item_1a.
        """
        if not accession:
            return ""
        # Strip dashes for the path component
        compact = accession.replace("-", "")
        if len(compact) < 18:
            return ""
        # We don't always have the CIK at synthesizer level. The index
        # page is reachable by the all-acc URL pattern.
        return f"https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&filenum={compact}&type=&dateb=&owner=include&count=40"

    # -----------------------------------------------------------------
    # Empty / fallback formatting
    # -----------------------------------------------------------------

    def _empty_response(self, retrieval: RetrievalResult) -> str:
        """Honest message when retrieval returned no mentions."""
        notes_str = "; ".join(retrieval.notes) if retrieval.notes else "no specific notes"
        return (
            "I couldn't find filing-graph data to ground an answer to that question. "
            f"({notes_str})"
        )

    @staticmethod
    def _remove_invalid_citation_tags(answer: str, citation_count: int) -> str:
        """Remove citation tags the model invented outside the provided range."""
        valid = {f"CITATION_{i}" for i in range(1, citation_count + 1)}

        def repl(match: re.Match) -> str:
            citation_id = match.group(1)
            return match.group(0) if citation_id in valid else ""

        return re.sub(r"\[(CITATION_\d+)\]", repl, answer)
