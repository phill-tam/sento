/**
 * Whether to offer the content-management UI.
 *
 * Not a feature flag — the per-epic flags were removed once every epic
 * shipped (ADR 012). This is access control standing in for the auth
 * this project doesn't have: the CMS drives unauthenticated write
 * endpoints, so the UI for it stays hidden unless you explicitly opt in.
 *
 * The backend enforces the same thing independently via
 * ADMIN_WRITES_ENABLED — this only controls whether the UI is offered,
 * never whether the API accepts the call. Setting this alone gets you a
 * page whose requests 404.
 */
export const ADMIN_WRITES_ENABLED = import.meta.env.VITE_ADMIN_WRITES_ENABLED === "true";
