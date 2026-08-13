/**
 * Error vocabulary shared by every persistence implementation.
 *
 * These lived in api.js until epic 013, which gave the app a second store
 * (localSentenceStore) that has to throw errors callers cannot tell apart
 * from the HTTP client's — the 409 on deleting a non-empty folder, the 404
 * on an unknown one. Leaving them in api.js meant the local store imported
 * the fetch wrapper and API_BASE_URL to get at two class declarations.
 *
 * api.js re-exports both, so `import { ApiError } from "./api"` keeps
 * working and nothing else had to change.
 */

export class ApiError extends Error {
  constructor(message, { status, body } = {}) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

// Thrown specifically when the backend's SentenceGenerationError shape is
// detected on a 429 — lets useSentenceGenerator (epic 5) show the dedicated
// rate-limit notice instead of a generic failure message, per the epic's
// "clear error notice, not silent failure" requirement.
export class RateLimitError extends ApiError {
  constructor(message, opts) {
    super(message, opts);
    this.name = "RateLimitError";
  }
}
