from pydantic import BaseModel


class UploadRowResult(BaseModel):
    """Outcome for a single row in a CSV batch upload."""

    row: int
    status: str  # "success" | "error"
    error: str | None = None


class BatchUploadResponse(BaseModel):
    """Shared response shape for all three content-line upload endpoints.

    Row-granularity, not file-granularity — a batch of 200 rows with 3
    malformed ones still reports 197 successes individually.
    """

    results: list[UploadRowResult]
    success_count: int
    error_count: int