"""
Subgraph retrieval for GraphRAG synthesis.

This module runs intent-specific Cypher against Neo4j and returns
structured RetrievalResult payloads. It is purely deterministic - no
LLM here. The synthesizer takes whatever this returns and weaves it
into a cited answer.

Design choices:

  - One method per intent type. Each method knows the shape of its
    intent's Cypher and the shape of its corresponding output payload.
    Easier to reason about than a generic query builder.

  - Queries are bounded and ranked. We cap mention rows at 25 per
    response because LLM context windows are not free. The cap is
    chosen so the synthesizer sees enough variety to ground citations
    without overflowing token budgets.

  - The retriever sets a confidence score on each RetrievalResult.
    It's a simple heuristic (mostly: how many mentions did we find,
    and across how many distinct concepts/companies). The service
    layer uses this to decide whether to fall back.

  - We always return the same RetrievalResult shape regardless of
    intent. The synthesizer dispatches on intent and reads the
    correct nested payload.
"""

from __future__ import annotations

import time

from neo4j import AsyncDriver

from .types import (
    CompanyExposureSummary,
    CompanyRiskProfile,
    ConceptSummary,
    Direction,
    HeadlineOpportunityResult,
    IntentResult,
    IntentType,
    MentionRow,
    ResolutionResult,
    RetrievalResult,
)


# Caps tuned for context window economy. Adjust if synthesizer
# context starts feeling thin.
MAX_CONCEPT_SUMMARIES = 10
MAX_SAMPLE_MENTIONS = 10
MAX_COMPANY_SUMMARIES = 10


def _confidence_to_float(value) -> float:
    """Normalize graph confidence values into [0, 1].

    Layer 1 stores confidence as enum-like labels (`HIGH`, `MEDIUM`, `LOW`),
    while unit tests and future callers may provide numeric confidence. The
    retriever exposes a numeric score in `MentionRow` either way.
    """
    if value is None:
        return 0.0
    if isinstance(value, (int, float)):
        return max(0.0, min(1.0, float(value)))
    label = str(value).strip().upper()
    if label == "HIGH":
        return 0.9
    if label == "MEDIUM":
        return 0.6
    if label == "LOW":
        return 0.3
    try:
        return max(0.0, min(1.0, float(label)))
    except ValueError:
        return 0.0


class SubgraphRetriever:
    """Cypher-driven retrieval for the supported intents.

    Constructed once with a Neo4j AsyncDriver.
    """

    def __init__(self, driver: AsyncDriver):
        self._driver = driver

    async def retrieve(
        self,
        intent: IntentResult,
        resolution: ResolutionResult,
    ) -> RetrievalResult:
        """Dispatch to the correct retriever based on intent.

        Returns a RetrievalResult with confidence=0.0 if the intent
        type is not supported here. The service layer treats that as
        a fallback signal.
        """
        t_start = time.time()

        if intent.intent == IntentType.COMPANY_RISK_PROFILE:
            payload = await self._retrieve_company_risk_profile(intent)
            elapsed_ms = int((time.time() - t_start) * 1000)
            confidence = self._score_company_risk(payload)
            return RetrievalResult(
                intent=intent.intent,
                confidence=confidence,
                elapsed_ms=elapsed_ms,
                notes=self._build_company_notes(intent, payload),
                company_risk_profile=payload,
            )

        if intent.intent == IntentType.HEADLINE_OPPORTUNITY:
            payload = await self._retrieve_headline_opportunity(intent, resolution)
            elapsed_ms = int((time.time() - t_start) * 1000)
            confidence = self._score_headline_opportunity(payload)
            return RetrievalResult(
                intent=intent.intent,
                confidence=confidence,
                elapsed_ms=elapsed_ms,
                notes=self._build_headline_notes(intent, resolution, payload),
                headline_opportunity=payload,
            )

        # Unsupported intent - return empty result with zero confidence
        return RetrievalResult(
            intent=intent.intent,
            confidence=0.0,
            elapsed_ms=int((time.time() - t_start) * 1000),
            notes=["intent not supported by retriever"],
        )

    # -----------------------------------------------------------------
    # COMPANY_RISK_PROFILE
    # -----------------------------------------------------------------

    async def _retrieve_company_risk_profile(
        self,
        intent: IntentResult,
    ) -> CompanyRiskProfile | None:
        """Return aggregated risk profile for the user's first ticker.

        For v1 we only handle the first ticker. Multi-ticker comparison
        is its own intent (PEER_COMPARISON, future). If the user named
        no ticker, we return None and the service layer falls back.
        """
        if not intent.tickers:
            return None
        ticker = intent.tickers[0]

        # Step 1: locate the latest 10-K filing for the ticker. We
        # prefer 10-K because risk factor disclosure depth is highest;
        # 10-Q risk factors are typically incremental updates.
        filing_cypher = """
        MATCH (c:Company {ticker: $ticker})-[:FILED]->(f:Filing)
        WHERE f.form_type = '10-K'
        RETURN f.accession AS accession, f.period AS period
        ORDER BY f.period DESC
        LIMIT 1
        """

        async with self._driver.session() as session:
            filing_result = await session.run(filing_cypher, ticker=ticker)
            filing_row = await filing_result.single()

            if filing_row is None:
                return None

            latest_accession = filing_row["accession"]
            latest_period = filing_row["period"]

            # Step 2: aggregate concept counts for that filing.
            concepts_cypher = """
            MATCH (f:Filing {accession: $accession})-[:CONTAINS_MENTION]->(m:Mention)-[:INSTANCE_OF]->(con:Concept)
            WITH con,
                 count(m) AS mention_count,
                 sum(CASE WHEN m.magnitude = 'HIGH' THEN 1 ELSE 0 END) AS high_count,
                 collect(m.framing)[..3] AS samples
            RETURN con.id AS concept_id, con.category AS category,
                   mention_count, high_count, samples
            ORDER BY mention_count DESC, high_count DESC
            LIMIT $cap
            """
            concepts_result = await session.run(
                concepts_cypher,
                accession=latest_accession,
                cap=MAX_CONCEPT_SUMMARIES,
            )
            concept_rows = [r async for r in concepts_result]

            # Step 3: pull one representative mention per top concept for
            # citation. This keeps [CITATION_N] aligned with the concept
            # summaries the synthesizer sees, instead of a global high-magnitude
            # pool that may omit top concepts.
            concept_ids = [r["concept_id"] for r in concept_rows][:MAX_SAMPLE_MENTIONS]
            if concept_ids:
                mentions_cypher = """
                UNWIND range(0, size($concept_ids) - 1) AS idx
                WITH idx, $concept_ids[idx] AS concept_id
                MATCH (f:Filing {accession: $accession})-[:CONTAINS_MENTION]->(m:Mention)-[:INSTANCE_OF]->(con:Concept {id: concept_id})
                WITH idx, con, m
                ORDER BY
                  idx,
                  CASE m.magnitude WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
                  CASE m.confidence WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END
                WITH idx, collect({
                  framing: m.framing,
                  evidence: m.evidence,
                  direction: m.direction,
                  magnitude: m.magnitude,
                  confidence: m.confidence,
                  concept_id: con.id,
                  section: m.section
                })[0] AS row
                RETURN row.framing AS framing, row.evidence AS evidence,
                       row.direction AS direction, row.magnitude AS magnitude,
                       row.confidence AS confidence,
                       row.concept_id AS concept_id,
                       row.section AS section,
                       $ticker AS ticker, $period AS period, $accession AS accession
                ORDER BY idx
                """
                mentions_result = await session.run(
                    mentions_cypher,
                    accession=latest_accession,
                    ticker=ticker,
                    period=latest_period,
                    concept_ids=concept_ids,
                )
                mention_rows = [r async for r in mentions_result]
            else:
                mention_rows = []

        return CompanyRiskProfile(
            ticker=ticker,
            latest_period=latest_period,
            latest_accession=latest_accession,
            concept_summaries=[
                ConceptSummary(
                    concept_id=r["concept_id"],
                    category=r["category"] or "",
                    mention_count=r["mention_count"],
                    high_magnitude_count=r["high_count"],
                    sample_framings=list(r["samples"] or []),
                )
                for r in concept_rows
            ],
            sample_mentions=[
                MentionRow(
                    ticker=r["ticker"],
                    period=r["period"],
                    accession=r["accession"],
                    section=r["section"] or "item_1a",
                    concept_id=r["concept_id"],
                    framing=r["framing"] or "",
                    evidence=r["evidence"] or "",
                    direction=r["direction"] or "NEUTRAL",
                    magnitude=r["magnitude"] or "MEDIUM",
                    confidence=_confidence_to_float(r["confidence"]),
                )
                for r in mention_rows
            ],
        )

    def _score_company_risk(self, payload: CompanyRiskProfile | None) -> float:
        """Heuristic confidence in [0, 1] for COMPANY_RISK_PROFILE.

        Strong: 5+ concept summaries and 8+ sample mentions.
        Weak:   1-2 concept summaries or fewer than 4 mentions.
        Zero:   no payload (ticker not in coverage).
        """
        if payload is None:
            return 0.0
        n_concepts = len(payload.concept_summaries)
        n_mentions = len(payload.sample_mentions)
        if n_concepts >= 5 and n_mentions >= 8:
            return 0.95
        if n_concepts >= 3 and n_mentions >= 5:
            return 0.75
        if n_concepts >= 1 and n_mentions >= 1:
            return 0.45
        return 0.0

    def _build_company_notes(
        self,
        intent: IntentResult,
        payload: CompanyRiskProfile | None,
    ) -> list[str]:
        notes: list[str] = []
        if payload is None:
            if intent.tickers:
                notes.append(f"no filings indexed for ticker {intent.tickers[0]}")
            else:
                notes.append("no ticker found in user query")
            return notes
        notes.append(f"latest 10-K: {payload.latest_period}")
        notes.append(f"{len(payload.concept_summaries)} concepts, {len(payload.sample_mentions)} sample mentions")
        if len(intent.tickers) > 1:
            notes.append(f"multi-ticker query; only used first: {intent.tickers[0]}")
        return notes

    # -----------------------------------------------------------------
    # HEADLINE_OPPORTUNITY
    # -----------------------------------------------------------------

    async def _retrieve_headline_opportunity(
        self,
        intent: IntentResult,
        resolution: ResolutionResult,
    ) -> HeadlineOpportunityResult | None:
        """Return companies whose mentions involve the resolved entities.

        Direction is preserved as user intent metadata, but the Cypher does
        not filter on m.direction. The v1 graph is built primarily from risk
        disclosures, so POSITIVE mentions are too sparse to support beneficiary
        retrieval directly. We instead retrieve disclosed exposure to the
        resolved entities and let synthesis explain what the filings can and
        cannot support.

        If no entities resolved, we can still retrieve by concept/theme
        phrases such as "export controls" by matching mention framing,
        evidence, and concept metadata. Partial entity resolution (some hit,
        some miss) still proceeds with what was resolved; the unresolved
        phrases are reported in notes for transparency.
        """
        theme_terms = [p.strip().lower() for p in intent.concept_phrases if p and p.strip()]
        if not resolution.resolved and not theme_terms:
            return None

        entity_hashes = [e.entity_hash for e in resolution.resolved]
        direction = intent.direction_filter

        # Step 1: aggregate per-company exposure.
        if entity_hashes:
            company_cypher = """
            MATCH (m:Mention)-[:INVOLVES]->(e:RawEntity)
            WHERE e.hash IN $entity_hashes
            WITH m
            MATCH (f:Filing)-[:CONTAINS_MENTION]->(m)-[:INSTANCE_OF]->(con:Concept)
            WITH f.ticker AS ticker, con.id AS concept_id, m, f.period AS period
            WITH ticker,
                 count(m) AS mention_count,
                 collect(DISTINCT concept_id) AS concept_ids,
                 max(period) AS latest_period
            RETURN ticker, mention_count, concept_ids, latest_period
            ORDER BY mention_count DESC
            LIMIT $cap
            """
            company_params = {"entity_hashes": entity_hashes, "cap": MAX_COMPANY_SUMMARIES}
        else:
            company_cypher = """
        MATCH (f:Filing)-[:CONTAINS_MENTION]->(m)-[:INSTANCE_OF]->(con:Concept)
            WHERE any(term IN $theme_terms WHERE
                toLower(m.framing) CONTAINS term OR
                toLower(m.evidence) CONTAINS term OR
                toLower(con.id) CONTAINS replace(term, ' ', '_') OR
                toLower(con.name) CONTAINS term
            )
        WITH f.ticker AS ticker, con.id AS concept_id, m, f.period AS period
        WITH ticker,
             count(m) AS mention_count,
             collect(DISTINCT concept_id) AS concept_ids,
             max(period) AS latest_period
        RETURN ticker, mention_count, concept_ids, latest_period
        ORDER BY mention_count DESC
        LIMIT $cap
        """
            company_params = {"theme_terms": theme_terms, "cap": MAX_COMPANY_SUMMARIES}

        async with self._driver.session() as session:
            company_result = await session.run(
                company_cypher,
                **company_params,
            )
            company_rows = [r async for r in company_result]

            top_tickers = [r["ticker"] for r in company_rows]
            if not top_tickers:
                mention_rows = []
            else:
                # Keep cited mentions aligned with the top company summaries.
                # One representative mention per top company is easier for the
                # synthesizer to cite correctly than a global pool of latest
                # high-magnitude mentions from unrelated tickers.
                if entity_hashes:
                    mentions_cypher = """
                    MATCH (m:Mention)-[:INVOLVES]->(e:RawEntity)
                    WHERE e.hash IN $entity_hashes
                    WITH m
                    MATCH (f:Filing)-[:CONTAINS_MENTION]->(m)-[:INSTANCE_OF]->(con:Concept)
                    WHERE f.ticker IN $tickers
                    WITH f, m, con
                    ORDER BY
                      f.ticker,
                      CASE m.magnitude WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
                      CASE m.confidence WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END,
                      f.period DESC
                    WITH f.ticker AS ticker, collect({
                      period: f.period,
                      accession: f.accession,
                      section: m.section,
                      concept_id: con.id,
                      framing: m.framing,
                      evidence: m.evidence,
                      direction: m.direction,
                      magnitude: m.magnitude,
                      confidence: m.confidence
                    })[0] AS row
                    RETURN ticker, row.period AS period, row.accession AS accession,
                           row.section AS section, row.concept_id AS concept_id,
                           row.framing AS framing, row.evidence AS evidence,
                           row.direction AS direction, row.magnitude AS magnitude,
                           row.confidence AS confidence
                    LIMIT $cap
                    """
                    mention_params = {
                        "entity_hashes": entity_hashes,
                        "tickers": top_tickers,
                        "cap": MAX_SAMPLE_MENTIONS,
                    }
                else:
                    mentions_cypher = """
                MATCH (f:Filing)-[:CONTAINS_MENTION]->(m)-[:INSTANCE_OF]->(con:Concept)
                WHERE f.ticker IN $tickers
                    AND any(term IN $theme_terms WHERE
                        toLower(m.framing) CONTAINS term OR
                        toLower(m.evidence) CONTAINS term OR
                        toLower(con.id) CONTAINS replace(term, ' ', '_') OR
                        toLower(con.name) CONTAINS term
                    )
                WITH f, m, con
                ORDER BY
                  f.ticker,
                  CASE m.magnitude WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 ELSE 2 END,
                  CASE m.confidence WHEN 'HIGH' THEN 0 WHEN 'MEDIUM' THEN 1 WHEN 'LOW' THEN 2 ELSE 3 END,
                  f.period DESC
                WITH f.ticker AS ticker, collect({
                  period: f.period,
                  accession: f.accession,
                  section: m.section,
                  concept_id: con.id,
                  framing: m.framing,
                  evidence: m.evidence,
                  direction: m.direction,
                  magnitude: m.magnitude,
                  confidence: m.confidence
                })[0] AS row
                RETURN ticker, row.period AS period, row.accession AS accession,
                       row.section AS section, row.concept_id AS concept_id,
                       row.framing AS framing, row.evidence AS evidence,
                       row.direction AS direction, row.magnitude AS magnitude,
                       row.confidence AS confidence
                LIMIT $cap
                """
                    mention_params = {
                        "theme_terms": theme_terms,
                        "tickers": top_tickers,
                        "cap": MAX_SAMPLE_MENTIONS,
                    }

                mentions_result = await session.run(
                    mentions_cypher,
                    **mention_params,
                )
                mention_rows = [r async for r in mentions_result]

        return HeadlineOpportunityResult(
            direction_filter=direction,
            matched_entities=resolution.resolved,
            theme_phrases=intent.concept_phrases,
            company_summaries=[
                CompanyExposureSummary(
                    ticker=r["ticker"],
                    mention_count=r["mention_count"],
                    concept_ids=list(r["concept_ids"] or []),
                    latest_period=r["latest_period"] or "",
                )
                for r in company_rows
            ],
            sample_mentions=[
                MentionRow(
                    ticker=r["ticker"],
                    period=r["period"],
                    accession=r["accession"],
                    section=r["section"] or "item_1a",
                    concept_id=r["concept_id"],
                    framing=r["framing"] or "",
                    evidence=r["evidence"] or "",
                    direction=r["direction"] or "NEUTRAL",
                    magnitude=r["magnitude"] or "MEDIUM",
                    confidence=_confidence_to_float(r["confidence"]),
                )
                for r in mention_rows
            ],
        )

    def _score_headline_opportunity(
        self,
        payload: HeadlineOpportunityResult | None,
    ) -> float:
        """Heuristic confidence in [0, 1] for HEADLINE_OPPORTUNITY.

        Strong: 3+ companies and 8+ sample mentions.
        Weak:   1-2 companies or 1-3 mentions.
        Zero:   no resolved entities or no matching mentions.
        """
        if payload is None:
            return 0.0
        n_companies = len(payload.company_summaries)
        n_mentions = len(payload.sample_mentions)
        if n_companies >= 3 and n_mentions >= 8:
            return 0.9
        if n_companies >= 2 and n_mentions >= 4:
            return 0.65
        if n_companies >= 1 and n_mentions >= 1:
            return 0.4
        return 0.0

    def _build_headline_notes(
        self,
        intent: IntentResult,
        resolution: ResolutionResult,
        payload: HeadlineOpportunityResult | None,
    ) -> list[str]:
        notes: list[str] = []
        if not resolution.resolved:
            if intent.concept_phrases:
                notes.append(
                    f"no entity phrases resolved; using theme search: {', '.join(intent.concept_phrases)}"
                )
            else:
                notes.append("no entity phrases resolved against the graph")
                return notes
        else:
            notes.append(f"resolved entities: {', '.join(e.canonical_name for e in resolution.resolved)}")
        if resolution.unresolved_phrases:
            notes.append(
                f"unresolved phrases: {', '.join(resolution.unresolved_phrases)}"
            )
        if payload is not None:
            notes.append(
                f"{len(payload.company_summaries)} companies, "
                f"{len(payload.sample_mentions)} sample mentions"
            )
            notes.append(
                f"requested direction: {intent.direction_filter.value}; "
                "retrieved disclosed exposure without direction filtering"
            )
        return notes
