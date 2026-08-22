"""Turns an unhandled exception into a normal response, below CORS.

Without this, a 500 from a production request reaches the browser with
no `Access-Control-Allow-Origin` header, so the console reports it as a
CORS failure and says nothing about the actual error. That is not a
cosmetic difference — it points a reader at the wrong layer entirely. It
cost a real debugging session: a missing migration in production
surfaced as "blocked by CORS policy" against an origin that was already
in the allowlist.

The cause is middleware order, which is why the obvious fix does not
work. Starlette builds the stack as:

    ServerErrorMiddleware -> user middleware (CORS) -> ExceptionMiddleware -> routes

`app.add_exception_handler(Exception, ...)` registers with
`ServerErrorMiddleware`, the *outermost* layer — so its response is
produced after CORS has already been passed, and gains no headers. The
exception has to be caught *inside* CORS instead, which means a
middleware added before it (Starlette's `add_middleware` inserts at the
front, so the last one added ends up outermost).

`BaseHTTPMiddleware` is used rather than a raw ASGI class for
readability; its known limitations are around streaming responses and
background tasks, and this API returns plain JSON from every route.

The exception is logged here because catching it takes that job away
from `ServerErrorMiddleware`, which would otherwise be what puts the
traceback in the Render logs. Losing the traceback while fixing the
headers would trade one blind debugging session for another.
"""

import logging

from fastapi import FastAPI, Request
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware

logger = logging.getLogger(__name__)


async def _return_500_as_a_normal_response(request: Request, call_next):
    try:
        return await call_next(request)
    except Exception:
        # HTTPException never arrives here — ExceptionMiddleware sits
        # further in and has already turned it into a response, so this
        # only ever sees genuinely unhandled errors.
        logger.exception(
            "Unhandled error serving %s %s", request.method, request.url.path
        )
        return JSONResponse(status_code=500, content={"detail": "Internal Server Error"})


def add_error_handling_middleware(app: FastAPI) -> None:
    """Must be added BEFORE the CORS middleware.

    Order is the whole point: the last middleware added is the outermost,
    so CORS has to be added after this one to end up wrapping it and
    decorating the response this produces.
    """
    app.add_middleware(BaseHTTPMiddleware, dispatch=_return_500_as_a_normal_response)
