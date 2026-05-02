# FinDash GraphRAG Service

This package ports the framework-free GraphRAG chatbot logic from
`filing-intel-engine` into the Django backend. The Django layer provides wiring:
Azure OpenAI for `ChatLLM`, a pooled Neo4j driver, settings-based configuration,
and `/api/chat/` response serialization.

## Expected Database State

Django assumes the filing graph backing stores have already been migrated from
the `filing-intel-engine` dev environment. It does not ingest or backfill data.
If backing data is missing, authenticated GraphRAG requests will fall back
through the normal service fallback path when retrieval returns nothing.

Current expected snapshot:

- Neo4j: 50 companies, 268 filings, 33,155 mentions, 2,102 `DRIFTED_ON` edges,
  all constraints/indexes from `filing-intel-engine/schema.cypher`, and all
  filing/concept/entity relationships.
- Qdrant: `mention_embeddings` collection with 33,155 vectors at 4096
  dimensions.
- MongoDB: `findash` database with `extraction_state`, `drift_alerts`,
  `filings_raw`, `ontology_versions`, and `promotion_candidates`.

The ingestion pipeline remains in `filing-intel-engine`. Production data is a
periodic snapshot, not live replication; production goes stale until the next
dump/restore cycle.

Snapshot export/import is owned by `filing-intel-engine`:

- `scripts/db_export.sh` creates a timestamped Neo4j/Qdrant/MongoDB tarball.
- `scripts/db_import.sh` restores that tarball into a target environment.
- `docs/data_migration.md` is the operator runbook for pre-checks, restore,
  validation, and rollback.

## Runtime Behavior

- Unauthenticated `/api/chat/` requests keep the existing Azure free-tier path.
- Authenticated requests use GraphRAG only when `FILING_GRAPH_ENABLED=True`.
- GraphRAG fallback returns a general Azure answer with the filing-graph prefix
  defined in `service.py`.
- Startup health checks log warnings for missing/empty Neo4j, Qdrant, or Mongo
  stores but do not crash Django.

## Demo Checklist

1. Set `FILING_GRAPH_ENABLED=True`.
2. Configure Azure OpenAI settings.
3. Point `NEO4J_URI`, `QDRANT_HOST`/`QDRANT_PORT`, and `MONGO_URI` at the
   private migrated/dev databases.
4. Start FinDash-web and log in.
5. Confirm the chatbot label reads `FILING GRAPH`.
6. Ask `What are NVDA's biggest filing risks?` and verify a cited graph answer.
7. Ask an off-topic query and verify graceful fallback.
