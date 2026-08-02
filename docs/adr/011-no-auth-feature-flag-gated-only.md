# ADR 011 — Content Management Has No Auth Gate; Feature Flag Is Not a Security Boundary

**Status:** Accepted
**Date:** 2026-08-03
**Epic:** 002 — Content Management

## Context

The Content Management endpoints allow uploading and modifying content
data with no restriction on who can call them. No `User` model, session,
token, or any authentication/authorization mechanism exists anywhere in
the project at this point. Epic 002 is, by its own problem statement, an
authoring tool for solo use, not a multi-user or public-facing feature.

## Decision

No authentication or authorization is implemented for the CMS in this
epic. Access is controlled entirely by `FEATURE_CONTENT_MANAGEMENT`
(backend Pydantic Settings flag, default `false`) and
`FEATURE_FLAGS.FEATURE_CONTENT_MANAGEMENT` (frontend, default `false`,
static property not tied to a Vite env var). When the flag is off, the
backend routes are absent from the API schema entirely (gated at
`api/v1/router.py`'s conditional `include_router` calls, not just
blocked per-request), and the frontend never renders the `IconRail`
entry point or `ContentManagementPage`.

This is explicitly a **visibility/rollout control, not a security
boundary.** The flag prevents accidental exposure in normal operation; it
does not prevent access by anyone who can reach the backend directly with
the flag enabled, or who has direct database access.

## Consequences

**Positive:**
- Epic 002 shipped without inventing a throwaway auth scheme that would
  need to be replaced once real access control exists — avoids sunk cost
  in a temporary mechanism.
- The flag-off default means the endpoints genuinely don't exist in the
  API surface for any environment where the flag isn't explicitly
  enabled, which is a meaningfully stronger default than "endpoints exist
  but return 403."

**Negative:**
- If `FEATURE_CONTENT_MANAGEMENT=true` is ever set in a production
  environment reachable from the internet, the upload endpoints are fully
  open — anyone who can reach the API can upload or view content, with no
  logging of who made a change.
- There's real risk of this distinction being forgotten later: a future
  contributor (or future self) could reasonably assume "feature-flagged"
  implies "access-controlled," and enable the flag in a shared or public
  environment believing it's already gated. This ADR exists specifically
  to make that assumption incorrect and explicit.

## Alternatives Considered

**Basic auth / a single shared credential as a stopgap.** Rejected — would
require inventing credential storage and a check mechanism with no real
`User` model to attach it to, likely to be discarded rather than extended
once real auth exists; not worth the implementation cost for a
solo-authoring tool during initial development.

**Block the CMS routes outside `localhost` at the infrastructure level
(e.g. reverse proxy rule) instead of a feature flag.** Rejected as the
*sole* mechanism — infrastructure-level blocking is a reasonable
additional layer, but shouldn't replace the flag, since the flag also
controls whether the feature is visible/available at the application
level (frontend nav, OpenAPI schema) regardless of network topology.

## Follow-up

Tracked as a Planned Upgrade in the epic 002 doc: implement real access
control once an auth system exists project-wide. This ADR remains the
record of the interim posture until that happens — it should be marked
Superseded, not deleted, once real auth lands.