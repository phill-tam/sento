from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env", env_file_encoding="utf-8", extra="ignore"
    )

    database_url: str
    migrations_database_url: str = ""

    # Mounts the unauthenticated content-write endpoints (CSV upload,
    # status PATCH). Not a feature flag — those were removed with ADR
    # 012 — but access control standing in for the auth this project
    # does not have. Leave false anywhere reachable by anyone else.
    admin_writes_enabled: bool = False

    # Sentence Generator (epic 5) — selects the AI provider at runtime.
    # "development" -> Gemini, "production" -> Claude. See
    # services/sentence_generation_service.py for the switch itself.
    environment: str = "development"
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash"
    anthropic_api_key: str = ""
    anthropic_model: str = "claude-sonnet-4-5"

    def resolved_migrations_url(self) -> str:
        """Falls back to database_url when no separate migrations URL is set —
        true for local Postgres, where there's no pooler distinction to make."""
        return self.migrations_database_url or self.database_url


settings = Settings()