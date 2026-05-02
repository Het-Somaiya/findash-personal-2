"""
Data contracts for chatbot modules.

These are plain dataclasses chosen for portability and clarity. Every
inter-module call accepts and returns one of these types. Using
dataclasses rather than dicts lets the type system catch contract
mismatches at module boundaries.

All fields use built-in types or other dataclasses defined in this
module. No third-party types are exposed across module boundaries to
keep the Django port mechanical.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum


class IntentType(str, Enum):
    """Recognized intents for v1."""

    COMPANY_RISK_PROFILE = "COMPANY_RISK_PROFILE"
    HEADLINE_OPPORTUNITY = "HEADLINE_OPPORTUNITY"
    UNSUPPORTED = "UNSUPPORTED"


class Direction(str, Enum):
    """Mention direction filter used by HEADLINE_OPPORTUNITY retrieval."""

    POSITIVE = "POSITIVE"
    NEGATIVE = "NEGATIVE"
    NEUTRAL = "NEUTRAL"
    ANY = "ANY"


@dataclass
class IntentResult:
    """Structured output of the intent classifier."""

    intent: IntentType
    raw_query: str
    tickers: list[str] = field(default_factory=list)
    entity_phrases: list[str] = field(default_factory=list)
    direction_filter: Direction = Direction.ANY
    concept_phrases: list[str] = field(default_factory=list)
    confidence: float = 0.0
    reasoning: str = ""


class MatchType(str, Enum):
    EXACT = "exact"
    SEMANTIC = "semantic"
    UNRESOLVED = "unresolved"


@dataclass
class ResolvedEntity:
    """One resolved entity from the Layer 2 RawEntity store."""

    phrase: str
    entity_hash: str
    canonical_name: str
    entity_type: str
    confidence: float
    match_type: MatchType


@dataclass
class ResolutionResult:
    """Output of the EntityResolver."""

    resolved: list[ResolvedEntity] = field(default_factory=list)
    unresolved_phrases: list[str] = field(default_factory=list)


@dataclass
class MentionRow:
    """One Mention surfaced by retrieval, with citation metadata."""

    ticker: str
    period: str
    accession: str
    section: str
    concept_id: str
    framing: str
    evidence: str
    direction: str
    magnitude: str
    confidence: float


@dataclass
class ConceptSummary:
    """Aggregated count of mentions for one concept under one company."""

    concept_id: str
    category: str
    mention_count: int
    high_magnitude_count: int
    sample_framings: list[str] = field(default_factory=list)


@dataclass
class CompanyRiskProfile:
    """Aggregate payload for COMPANY_RISK_PROFILE retrieval."""

    ticker: str
    latest_period: str
    latest_accession: str
    concept_summaries: list[ConceptSummary] = field(default_factory=list)
    sample_mentions: list[MentionRow] = field(default_factory=list)


@dataclass
class CompanyExposureSummary:
    """One company's exposure to the resolved entities."""

    ticker: str
    mention_count: int
    concept_ids: list[str] = field(default_factory=list)
    latest_period: str = ""


@dataclass
class HeadlineOpportunityResult:
    """Aggregate payload for HEADLINE_OPPORTUNITY retrieval."""

    direction_filter: Direction
    matched_entities: list[ResolvedEntity] = field(default_factory=list)
    theme_phrases: list[str] = field(default_factory=list)
    company_summaries: list[CompanyExposureSummary] = field(default_factory=list)
    sample_mentions: list[MentionRow] = field(default_factory=list)


@dataclass
class RetrievalResult:
    """Discriminated union of intent-specific payloads."""

    intent: IntentType
    confidence: float
    elapsed_ms: int
    notes: list[str] = field(default_factory=list)
    company_risk_profile: CompanyRiskProfile | None = None
    headline_opportunity: HeadlineOpportunityResult | None = None


@dataclass
class Citation:
    """One citation paired with a [CITATION_N] placeholder in the answer."""

    id: str
    ticker: str
    period: str
    accession: str
    section: str
    concept_id: str
    framing: str
    evidence: str
    source_url: str = ""


@dataclass
class RetrievalSummary:
    """Lightweight retrieval summary attached to the response."""

    intent: IntentType
    results_returned: int
    elapsed_ms: int
    notes: list[str] = field(default_factory=list)


@dataclass
class ChatResponse:
    """Final response surfaced by the service layer to a UI or CLI."""

    answer: str
    citations: list[Citation]
    retrieval_summary: RetrievalSummary
    used_graph: bool
    fallback_reason: str = ""
