from logging.config import fileConfig

from dotenv import load_dotenv

load_dotenv()

from sqlalchemy import engine_from_config, pool

from alembic import context
from app.config.settings import settings
from app.database.base import Base

# Importing Base also registers all models on Base.metadata, via the model
# imports at the bottom of base.py. No separate model import list here —
# that list going stale (referencing models from a prior project) is
# exactly the bug this replaces.

config = context.config
# migrations always run against the direct (non-pooled) connection —
# pgbouncer transaction-mode pooling doesn't reliably support the
# session-level DDL Alembic needs
config.set_main_option("sqlalchemy.url", settings.resolved_migrations_url())

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

target_metadata = Base.metadata


def run_migrations_offline() -> None:
    url = config.get_main_option("sqlalchemy.url")
    context.configure(
        url=url,
        target_metadata=target_metadata,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
        render_as_batch=url.startswith("sqlite"),
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        # batch mode is a SQLite-only workaround for its lack of
        # ALTER TABLE ... ADD COLUMN ... REFERENCES support — Postgres
        # doesn't need it and shouldn't pay for table-rebuild-style
        # migrations it has no reason to run
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            render_as_batch=connection.dialect.name == "sqlite",
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()