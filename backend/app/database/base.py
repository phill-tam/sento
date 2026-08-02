from sqlalchemy.orm import DeclarativeBase


class Base(DeclarativeBase):
    """Shared declarative base for all ORM models.

    Intentionally does NOT import models here — that created a circular
    import (models import Base; if a model module is the first thing
    imported anywhere in the app, Base then tries to re-import that same
    partially-initialized module and fails). Model registration for
    Alembic's autogenerate lives in app/models/__init__.py instead, which
    has no reverse dependency on this file.
    """