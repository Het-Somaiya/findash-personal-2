"""
Entity resolution against the Layer 2 RawEntity store.

The resolver maps free-text phrases from a user's question (typically
extracted by the intent classifier as `entity_phrases`) to actual
RawEntity nodes in Neo4j. Without resolution, the retriever has nothing
to filter on for HEADLINE_OPPORTUNITY queries.

V1 implementation: Tier 1 exact match only.

  - The resolver does case-insensitive exact matches on
    RawEntity.canonical_name.
  - Common variants (e.g., "TSMC" vs "Taiwan Semiconductor") rely on
    Layer 2's own canonicalization, which already merges variants to
    a single canonical name during extraction.
  - Phrases with no exact match go into `unresolved_phrases`. The
    retriever notes the gap; the synthesizer can mention it to the user.

V2 (deferred): Tier 2 semantic match using Qdrant vector search over
embedded canonical names. Requires a one-time backfill of an
`entity_embeddings` Qdrant collection (~611 vectors, ~10s).

Why no LLM here? Resolution is a graph lookup, not a reasoning task.
LLM-driven matching would be slower, less deterministic, and would
hide which entities actually exist in the graph. Better to surface
the gap explicitly.
"""

from __future__ import annotations

from neo4j import AsyncDriver

from .types import (
    IntentResult,
    IntentType,
    MatchType,
    ResolutionResult,
    ResolvedEntity,
)


class EntityResolver:
    """Resolves free-text phrases to Layer 2 RawEntity nodes.

    Constructed once with a Neo4j AsyncDriver. The driver lifecycle
    (connection pooling, close) is the caller's responsibility.
    """

    def __init__(self, driver: AsyncDriver):
        self._driver = driver

    async def resolve(self, intent: IntentResult) -> ResolutionResult:
        """Resolve all entity phrases from an intent.

        Only HEADLINE_OPPORTUNITY uses entity resolution. For other
        intents this is effectively a no-op that returns an empty
        ResolutionResult, so callers can call resolve() unconditionally.
        """
        if intent.intent != IntentType.HEADLINE_OPPORTUNITY:
            return ResolutionResult()

        if not intent.entity_phrases:
            return ResolutionResult()

        return await self._resolve_phrases(intent.entity_phrases)

    async def _resolve_phrases(self, phrases: list[str]) -> ResolutionResult:
        """Look up each phrase against RawEntity.canonical_name.

        Single round-trip: we fetch all candidate matches in one query
        using UNWIND, then assemble ResolvedEntity objects per phrase.
        Phrases with no match end up in unresolved_phrases.
        """
        # De-duplicate phrases case-insensitively while preserving order
        seen: set[str] = set()
        unique_phrases = []
        for p in phrases:
            key = p.strip().lower()
            if key and key not in seen:
                seen.add(key)
                unique_phrases.append(p.strip())

        if not unique_phrases:
            return ResolutionResult()

        cypher = """
        UNWIND $phrases AS phrase
        OPTIONAL MATCH (e:RawEntity)
        WHERE toLower(e.canonical_name) = toLower(phrase)
        RETURN phrase, e.hash AS entity_hash, e.canonical_name AS canonical_name, e.type AS entity_type
        """

        async with self._driver.session() as session:
            result = await session.run(cypher, phrases=unique_phrases)
            rows = [record async for record in result]

        resolved: list[ResolvedEntity] = []
        unresolved: list[str] = []
        for row in rows:
            if row["entity_hash"] is None:
                unresolved.append(row["phrase"])
            else:
                resolved.append(ResolvedEntity(
                    phrase=row["phrase"],
                    entity_hash=row["entity_hash"],
                    canonical_name=row["canonical_name"],
                    entity_type=row["entity_type"] or "UNKNOWN",
                    confidence=1.0,
                    match_type=MatchType.EXACT,
                ))

        return ResolutionResult(
            resolved=resolved,
            unresolved_phrases=unresolved,
        )
