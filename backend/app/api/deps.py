"""Request-scoped dependencies shared by more than one route file.

Currently one: the device id the AI quota meters on (epic 016, ADR 022).
It lives here rather than in `ai_quota_service` because reading a header
is a transport concern — the service takes a device id and never learns
where it came from — and rather than being repeated inline in the two
route signatures, because the fall-back-to-anonymous rule has to be
identical in both or one endpoint becomes the cheap way in.
"""

from typing import Annotated
from uuid import UUID

from fastapi import Header


def device_id_header(
    x_device_id: Annotated[str | None, Header()] = None,
) -> str | None:
    """The caller's device id, or None when there isn't a usable one.

    None is not an error. `ai_quota_service.charge` maps it onto one
    shared anonymous budget, which is what makes omitting the header the
    worst option rather than a bypass — so this deliberately does not
    raise, and the endpoint stays usable by a client that has not sent
    one (ADR 022).

    Anything that isn't a UUID is treated as absent. The value becomes
    part of a counter key, so accepting arbitrary text would let a caller
    mint unlimited budgets *and* write unbounded rows into
    `usage_counters`; requiring the shape `crypto.randomUUID()` produces
    costs an honest client nothing. It is not a security check — a
    well-formed random UUID is just as free to mint — it only keeps the
    key space to one row per real client.

    Normalised through `str(UUID(...))` rather than passed through as
    typed, so that the same device sending upper- and lower-case forms of
    one id shares a budget instead of holding two.
    """
    if x_device_id is None:
        return None

    try:
        return str(UUID(x_device_id))
    except ValueError:
        return None
