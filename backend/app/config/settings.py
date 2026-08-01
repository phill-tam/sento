from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str
    migrations_database_url: str = ""

    def resolved_migrations_url(self) -> str:
        """Falls back to database_url when no separate migrations URL is set —
        true for local Postgres, where there's no pooler distinction to make."""
        return self.migrations_database_url or self.database_url


settings = Settings()