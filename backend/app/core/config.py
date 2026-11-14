"""Application configuration.

All settings are read from environment variables (or a local ``.env`` file).
Secrets that must never reach the browser live here and only here.
"""

from __future__ import annotations

import json
from functools import lru_cache
from typing import Annotated, Literal
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, NoDecode, SettingsConfigDict

Environment = Literal["local", "development", "staging", "production", "test"]


class Settings(BaseSettings):
    """Runtime configuration for the FIREWATCH X API."""

    model_config = SettingsConfigDict(
        env_file=(".env", "../.env"),
        env_file_encoding="utf-8",
        extra="ignore",
        case_sensitive=False,
    )

    # --- application ---------------------------------------------------------
    app_name: str = "FIREWATCH X"
    app_version: str = "0.1.0"
    environment: Environment = "local"
    debug: bool = False
    api_v1_prefix: str = "/api/v1"

    # --- security ------------------------------------------------------------
    # NoDecode: CORS_ORIGINS is accepted as a comma-separated list *or* JSON.
    cors_origins: Annotated[list[str], NoDecode] = Field(
        default_factory=lambda: [
            "http://localhost:5273",
            "http://127.0.0.1:5273",
        ]
    )
    docs_enabled: bool = True
    #: Per-client request limit; 0 disables the limiter (tests keep it off).
    rate_limit_per_minute: int = 0

    # --- persistence ---------------------------------------------------------
    # Production runs PostgreSQL + PostGIS. The default is a local SQLite file so
    # the API boots on a workstation without a database server; migrations are
    # dialect-aware and the PostGIS extension is only created on PostgreSQL.
    database_url: str = "sqlite+pysqlite:///./firewatch.db"
    database_echo: bool = False
    database_pool_size: int = 10
    #: Required for mutating admin endpoints when ENVIRONMENT=production.
    #: Sent as ``X-Admin-Token``; unset keeps local development frictionless.
    admin_token: str | None = None
    #: Browser session lifetime for operator accounts.
    session_ttl_hours: int = 12
    #: Bulk ingestion legitimately exceeds the interactive 60 s statement cap.
    #: Applied as SET LOCAL for the ingest transaction; 0 disables the limit.
    ingestion_statement_timeout_ms: int = 900_000
    database_pool_timeout: int = 30

    redis_url: str = "redis://localhost:6379/0"

    # --- deployment profiles -------------------------------------------------
    #: local | hybrid | cloud. Only configuration changes between them.
    deployment_mode: str = "local"
    #: local | r2 | s3
    storage_mode: str = "local"
    #: local | cloud | split  (split = local writes, cloud reads summaries)
    database_mode: str = "local"
    local_data_directory: str = "./data"
    #: Raw payload retention. Raw rows older than this are removed by the
    #: retention job; the canonical observations and all analysis are kept.
    raw_retention_days: int = 90
    #: Gzip level for raw-payload archives and payload blocks. 6 is the
    #: ratio/speed default; 9 is slower but smaller, 1 is fastest.
    archive_compression_level: int = Field(default=6, ge=1, le=9)
    #: Raw payloads are compressed in blocks of this many rows (per acquisition
    #: day and source). Per-row compression is ineffective at ~265 bytes/row.
    raw_block_rows: int = Field(default=2000, ge=1, le=50_000)
    #: The admin portal only exports payloads older than this, so live ingestion
    #: is never exported mid-flight.
    raw_export_min_age_days: int = 5
    #: Largest single export, in days, to keep one request bounded.
    raw_export_max_days: int = 62
    cloud_database_url: str | None = None
    #: Cloudflare R2 (S3-compatible). Absent credentials mean local-only.
    r2_account_id: str | None = None
    r2_access_key_id: str | None = None
    r2_secret_access_key: str | None = None
    r2_bucket_name: str | None = None
    r2_endpoint_url: str | None = None
    #: Allocation used to warn before exceeding the plan (bytes).
    r2_allocation_bytes: int = 25 * 1024**3

    # --- NASA FIRMS (Phase 2) ------------------------------------------------
    firms_map_key: str | None = None
    firms_base_url: str = "https://firms.modaps.eosdis.nasa.gov/api"
    firms_request_timeout: int = 60
    firms_max_retries: int = 4
    #: Repeated provider failures open a per-source circuit breaker.
    firms_circuit_failure_threshold: int = 5
    firms_circuit_cooldown_seconds: int = 60
    #: Process-wide request budget for the FIRMS key; 0 disables throttling.
    firms_requests_per_minute: int = 300

    # --- object storage (Phase 2+) -------------------------------------------
    object_storage_endpoint: str | None = None
    object_storage_bucket: str = "firewatch-data"
    object_storage_access_key: str | None = None
    object_storage_secret_key: str | None = None

    # --- AI assistant (Phase 7) ----------------------------------------------
    ai_provider: str | None = None
    ai_api_key: str | None = None
    ai_model: str | None = None

    # --- logging -------------------------------------------------------------
    log_level: Literal["DEBUG", "INFO", "WARNING", "ERROR", "CRITICAL"] = "INFO"
    log_json: bool = True

    @field_validator("cors_origins", mode="before")
    @classmethod
    def _split_origins(cls, value: object) -> object:
        """Accept a JSON array, a comma-separated string, or a real list."""
        if isinstance(value, str):
            text = value.strip()
            if text.startswith("["):
                try:
                    return json.loads(text)
                except json.JSONDecodeError:
                    return [text]
            return [item.strip() for item in text.split(",") if item.strip()]
        return value

    @field_validator("database_url", mode="before")
    @classmethod
    def _normalize_database_url(cls, value: object) -> object:
        """Accept managed-provider URLs as handed out.

        Supabase, Render and Fly all print ``postgresql://`` URLs. The project
        ships psycopg 3, so the driver is made explicit, and Supabase hosts get
        ``sslmode=require`` because they reject unencrypted connections.
        """
        if not isinstance(value, str):
            return value
        text = value.strip()
        if not text:
            return value
        if text.startswith("postgres://"):
            text = "postgresql://" + text[len("postgres://") :]
        if text.startswith("postgresql://"):
            text = "postgresql+psycopg://" + text[len("postgresql://") :]

        parts = urlsplit(text)
        host = (parts.hostname or "").lower()
        if host.endswith("supabase.co") or host.endswith("supabase.com"):
            query = dict(parse_qsl(parts.query, keep_blank_values=True))
            query.setdefault("sslmode", "require")
            text = urlunsplit(parts._replace(query=urlencode(query)))
        return text

    # --- derived helpers -----------------------------------------------------
    @property
    def database_dialect(self) -> str:
        return urlsplit(self.database_url).scheme.split("+")[0]

    @property
    def uses_pooler(self) -> bool:
        """True for a Supavisor/pgbouncer endpoint (transaction pooling)."""
        parts = urlsplit(self.database_url)
        return parts.port == 6543 or "pooler.supabase.com" in (parts.hostname or "").lower()

    @property
    def is_postgres(self) -> bool:
        return self.database_dialect in {"postgresql", "postgres"}

    @property
    def is_sqlite(self) -> bool:
        return self.database_dialect == "sqlite"

    @property
    def firms_configured(self) -> bool:
        return bool(self.firms_map_key)

    @property
    def ai_configured(self) -> bool:
        return bool(self.ai_provider and self.ai_api_key and self.ai_model)

    @property
    def is_production(self) -> bool:
        return self.environment == "production"


@lru_cache(maxsize=1)
def get_settings() -> Settings:
    """Return the process-wide settings singleton."""
    return Settings()
