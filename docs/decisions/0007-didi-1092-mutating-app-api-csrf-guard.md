# 0007. CSRF guard for mutating app API routes (DIDI-1092)

- **Status:** proposed
- **Date:** 2026-10-30

## Context

QA round 1 on DIDI-1001 noted that mutating exercise API handlers relied on SameSite=Lax session cookies and accepted JSON bodies without enforcing `Content-Type: application/json` or checking cross-site Origin. Better Auth routes are handled separately; this decision covers the app's own `/api/**` routes (excluding Better Auth).

CTO ruling on [DIDI-1092 comment faa8d286](https://linear.app/didi-build/issue/DIDI-1092#comment-faa8d286): no runtime route allowlist; CSRF on by default for non-safe methods under `/api/**`.

## Decision

For every request whose path starts with `/api/`, `handleRequest` runs `rejectMutatingAppApiCsrf` once before dispatch when the method is not safe (anything other than GET, HEAD, or OPTIONS) and the path is not under the sole exemption prefix `CSRF_EXEMPT_APP_API_AUTH_PREFIX` (`/api/auth`, exact prefix match so `/api/authx` is not exempt). This runs whether or not a handler exists for the path.

The guard:

1. Requires `Content-Type: application/json` (415 when missing or wrong).
2. Requires `Origin`, or `Referer` when Origin is absent, to match an allowed app origin: the request URL origin, `WEB_APP_BASE_URL`, or `AUTH_BASE_URL` (403 when missing or cross-site).
3. Returns only **403** or **415** with no new user-facing copy (existing JSON `{ error: "forbidden" }` for 403; empty body for 415).

After session checks, unregistered `/api/` paths may still return 404; CSRF runs first so a cross-site mutating probe gets 403, not 404.

`MUTATING_APP_API_ROUTE_SAMPLES` in `test/helpers/mutating-app-api-route-registry.ts` is test-only extra coverage for known routes. No production code imports it.

## Reasons

- One guard avoids per-handler drift and matches the portable `handleRequest` boundary.
- Default-on CSRF protects new mutating routes without registry rows.
- Origin plus JSON content type closes simple CSRF and content-sniffing gaps called out in QA without changing Better Auth.

## Consequences

- Browser and test clients must send `Content-Type: application/json` and a same-origin `Origin` (or `Referer`) on all non-safe app API calls under `/api/**`, including `DELETE`.
- GET app API routes and `/api/auth/**` are unchanged.
- Mutating routes registered only through `AppDependencies.extraRouteHandlers` outside the `/api/` prefix (Node dev/test exercise media fallbacks) are not covered by this guard until they move under `/api/`.

## Acceptance

Pending product or security review recorded on this ADR or in Linear before status moves from **proposed** to **accepted**.
