"""Engine and session management.

The engine is created lazily so that the API can start (and report degraded
readiness) even when the database server is unreachable.
"""

from __future__ import annotations

import os
from collections.abc import Iterator
from contextlib import contextmanager, suppress
from functools import lru_cache
from typing import Any

from sqlalchemy import Engine, create_engine, event
from sqlalchemy.orm import Session, sessionmaker
from sqlalchemy.pool import NullPool

from app.core.config import get_settings


def _serverless() -> bool:
    """True when the process is a short-lived function invocation."""
    return bool(os.getenv("VERCEL") or os.getenv("AWS_LAMBDA_FUNCTION_NAME"))


@lru_cache(maxsize=1)
def get_engine() -> Engine:
    settings = get_settings()
    kwargs: dict[str, object] = {
        "echo": settings.database_echo,
        "pool_pre_ping": True,
        "future": True,
    }
    if settings.is_sqlite:
        # SQLite has no server-side pool; allow cross-thread use for tests/dev.
        kwargs["connect_args"] = {"check_same_thread": False, "timeout": 30}
    else:
        connect_args: dict[str, object] = {}
        if settings.uses_pooler:
            # Transaction pooling (Supavisor, pgbouncer, Neon) cannot keep
            # server-side prepared statements between checkouts, and some
            # poolers reject libpq ``options`` as a startup parameter.
            connect_args["prepare_threshold"] = None
        else:
            # Pin the session time zone and bound runaway analytical queries.
            # 60 s is above every measured read (<= 0.25 s).
            connect_args["options"] = "-c timezone=UTC -c statement_timeout=60000"
        kwargs["connect_args"] = connect_args
        if _serverless() or settings.uses_pooler:
            # One connection per invocation: a pooled connection would outlive
            # the function and be dropped by the platform anyway.
            kwargs["poolclass"] = NullPool
        else:
            kwargs["pool_size"] = settings.database_pool_size
            kwargs["pool_timeout"] = settings.database_pool_timeout
            kwargs["pool_recycle"] = 1800
    engine = create_engine(settings.database_url, **kwargs)
    if settings.is_sqlite:
        _configure_sqlite(engine)
    else:
        _configure_postgres_timezone(engine)
    return engine


def _configure_postgres_timezone(engine: Engine) -> None:
    """Pin UTC on pooled connections that cannot take libpq ``options``."""

    @event.listens_for(engine, "connect")
    def _utc_session(dbapi_connection: Any, _record: Any) -> None:
        # Poolers do not accept ``options`` at startup, but a session-level SET
        # is allowed. Failing here must not break the connection.
        try:
            cursor = dbapi_connection.cursor()
            cursor.execute("SET TIME ZONE 'UTC'")
            cursor.close()
            dbapi_connection.commit()
        except Exception:  # noqa: BLE001 - best effort: Neon is UTC by default
            with suppress(Exception):
                dbapi_connection.rollback()


def _configure_sqlite(engine: Engine) -> None:
    """
    WAL + a busy timeout. Ingestion writes tens of thousands of rows in one
    transaction while the UI keeps polling for status; with the default rollback
    journal the reader and writer block each other and requests fail with
    "database is locked". WAL lets readers continue during writes and the timeout
    absorbs the remaining contention.
    """

    @event.listens_for(engine, "connect")
    def _sqlite_pragmas(dbapi_connection: Any, _record: Any) -> None:
        cursor = dbapi_connection.cursor()
        cursor.execute("PRAGMA journal_mode=WAL")
        cursor.execute("PRAGMA synchronous=NORMAL")
        cursor.execute("PRAGMA busy_timeout=30000")
        cursor.close()


@lru_cache(maxsize=1)
def get_session_factory() -> sessionmaker[Session]:
    return sessionmaker(bind=get_engine(), autoflush=False, expire_on_commit=False)


def get_session() -> Iterator[Session]:
    """FastAPI dependency yielding a request-scoped session."""
    session = get_session_factory()()
    try:
        yield session
    finally:
        session.close()


@contextmanager
def session_scope() -> Iterator[Session]:
    """Transactional scope for scripts, workers and services."""
    session = get_session_factory()()
    try:
        yield session
        session.commit()
    except Exception:
        session.rollback()
        raise
    finally:
        session.close()


def dispose_engine() -> None:
    """Release pooled connections (used on shutdown and between tests)."""
    if get_engine.cache_info().currsize:
        get_engine().dispose()
    get_engine.cache_clear()
    get_session_factory.cache_clear()
