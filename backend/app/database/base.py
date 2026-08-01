from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models."""


# Model modules are imported here once they exist, so Alembic's
# autogenerate can discover them via Base.metadata. Nothing to import
# yet — this branch is scaffold-only, no models.