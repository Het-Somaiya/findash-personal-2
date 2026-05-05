"""Non-fatal GraphRAG backing-store health checks."""

from __future__ import annotations

import logging

import httpx
from asgiref.sync import async_to_sync
from django.conf import settings
from pymongo import MongoClient

from .neo4j import check_neo4j_health

logger = logging.getLogger(__name__)

EXPECTED_QDRANT_COLLECTION = "mention_embeddings"
EXPECTED_QDRANT_VECTOR_DIM = 4096
EXPECTED_MONGO_COLLECTIONS = {
    "extraction_state",
    "drift_alerts",
    "filings_raw",
    "ontology_versions",
    "promotion_candidates",
}


def run_graphrag_health_check() -> dict:
    """Log warnings for missing GraphRAG backing data without crashing Django."""

    if not settings.FILING_GRAPH_ENABLED:
        return {"enabled": False}

    diagnostics: dict = {"enabled": True}

    try:
        diagnostics["neo4j"] = async_to_sync(check_neo4j_health)()
    except Exception as exc:
        logger.warning("GraphRAG Neo4j health check failed: %s", exc)
        diagnostics["neo4j_error"] = str(exc)

    try:
        diagnostics["qdrant"] = _check_qdrant()
    except Exception as exc:
        logger.warning("GraphRAG Qdrant health check failed: %s", exc)
        diagnostics["qdrant_error"] = str(exc)

    try:
        diagnostics["mongo"] = _check_mongo()
    except Exception as exc:
        logger.warning("GraphRAG Mongo health check failed: %s", exc)
        diagnostics["mongo_error"] = str(exc)

    return diagnostics


def _check_qdrant() -> dict:
    base_url = f"http://{settings.QDRANT_HOST}:{settings.QDRANT_PORT}"
    url = f"{base_url}/collections/{EXPECTED_QDRANT_COLLECTION}"
    response = httpx.get(url, timeout=5)
    response.raise_for_status()
    data = response.json()
    vectors = data.get("result", {}).get("config", {}).get("params", {}).get("vectors", {})
    vector_size = vectors.get("size")
    points_count = data.get("result", {}).get("points_count")
    if vector_size != EXPECTED_QDRANT_VECTOR_DIM:
        logger.warning(
            "GraphRAG Qdrant collection %s has vector dim %s, expected %s",
            EXPECTED_QDRANT_COLLECTION,
            vector_size,
            EXPECTED_QDRANT_VECTOR_DIM,
        )
    if not points_count:
        logger.warning("GraphRAG Qdrant collection %s has no points", EXPECTED_QDRANT_COLLECTION)
    return {"collection": EXPECTED_QDRANT_COLLECTION, "vector_size": vector_size, "points_count": points_count}


def _check_mongo() -> dict:
    client = MongoClient(settings.MONGO_URI, serverSelectionTimeoutMS=5000)
    try:
        db = client[settings.MONGO_DB_NAME]
        existing = set(db.list_collection_names())
        missing = sorted(EXPECTED_MONGO_COLLECTIONS - existing)
        if missing:
            logger.warning("GraphRAG Mongo missing expected collections: %s", ", ".join(missing))
        return {"database": settings.MONGO_DB_NAME, "missing_collections": missing}
    finally:
        client.close()
