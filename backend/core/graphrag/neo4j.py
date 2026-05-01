"""Neo4j driver lifecycle helpers for the GraphRAG service."""

from __future__ import annotations

import logging

from django.conf import settings
from neo4j import AsyncDriver, AsyncGraphDatabase

logger = logging.getLogger(__name__)

_driver: AsyncDriver | None = None


def get_neo4j_driver() -> AsyncDriver:
    """Return a process-local pooled AsyncDriver."""

    global _driver
    if _driver is None:
        _driver = AsyncGraphDatabase.driver(
            settings.NEO4J_URI,
            auth=(settings.NEO4J_USER, settings.NEO4J_PASSWORD),
        )
    return _driver


async def close_neo4j_driver() -> None:
    """Close the pooled driver, if initialized."""

    global _driver
    if _driver is not None:
        await _driver.close()
        _driver = None


async def check_neo4j_health() -> dict:
    """Return lightweight Neo4j graph health diagnostics."""

    driver = get_neo4j_driver()
    async with driver.session() as session:
        filing_count_result = await session.run(
            "MATCH (f:Filing) RETURN count(f) AS n"
        )
        filing_count_row = await filing_count_result.single()
        filing_count = filing_count_row["n"] if filing_count_row else 0
    if filing_count <= 0:
        logger.warning("GraphRAG Neo4j health check found no Filing nodes")
    return {"filing_count": filing_count}
