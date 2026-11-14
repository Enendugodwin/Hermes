"""Configuration parsing and derived flags."""

from __future__ import annotations

from app.core.config import Settings


def test_cors_origins_accept_comma_separated_values() -> None:
    settings = Settings(cors_origins="http://a.test, http://b.test", _env_file=None)  # type: ignore[call-arg]

    assert settings.cors_origins == ["http://a.test", "http://b.test"]


def test_cors_origins_accept_a_list() -> None:
    settings = Settings(cors_origins=["http://a.test"], _env_file=None)  # type: ignore[call-arg]

    assert settings.cors_origins == ["http://a.test"]


def test_postgres_flags() -> None:
    settings = Settings(
        database_url="postgresql+psycopg://u:p@localhost:5432/firewatch", _env_file=None
    )  # type: ignore[call-arg]

    assert settings.is_postgres is True
    assert settings.is_sqlite is False
    assert settings.database_dialect == "postgresql"


def test_sqlite_flags() -> None:
    settings = Settings(database_url="sqlite+pysqlite:///./x.db", _env_file=None)  # type: ignore[call-arg]

    assert settings.is_sqlite is True
    assert settings.is_postgres is False


def test_secrets_are_considered_absent_when_blank() -> None:
    settings = Settings(firms_map_key="", ai_provider=None, _env_file=None)  # type: ignore[call-arg]

    assert settings.firms_configured is False
    assert settings.ai_configured is False


def test_secrets_are_considered_present_when_supplied() -> None:
    settings = Settings(
        firms_map_key="abc123",
        ai_provider="openai",
        ai_api_key="k",
        ai_model="m",
        _env_file=None,
    )  # type: ignore[call-arg]

    assert settings.firms_configured is True
    assert settings.ai_configured is True

def test_managed_postgres_url_is_normalized() -> None:
    """A Supabase-style URL gets the psycopg driver and TLS without editing."""
    settings = Settings(
        database_url="postgresql://postgres:secret@db.abc.supabase.co:5432/postgres",
        _env_file=None,
    )  # type: ignore[call-arg]

    assert settings.database_url.startswith("postgresql+psycopg://")
    assert "sslmode=require" in settings.database_url
    assert settings.is_postgres is True
    assert settings.uses_pooler is False


def test_pooler_url_is_recognised() -> None:
    settings = Settings(
        database_url=(
            "postgres://postgres.abc:pw@aws-0-eu-west-2.pooler.supabase.com:6543/postgres"
        ),
        _env_file=None,
    )  # type: ignore[call-arg]

    assert settings.uses_pooler is True
    assert settings.is_postgres is True
    assert settings.database_url.startswith("postgresql+psycopg://")
    assert "sslmode=require" in settings.database_url