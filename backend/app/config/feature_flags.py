from pydantic_settings import BaseSettings, SettingsConfigDict


class FeatureFlags(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=".env",
        env_file_encoding="utf-8",
        env_prefix="FEATURE_",
        extra="ignore",
    )

    content_management: bool = False


flags = FeatureFlags()