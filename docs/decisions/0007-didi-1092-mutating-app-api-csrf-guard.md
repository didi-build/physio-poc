# 0007. CSRF guard for mutating app API routes (DIDI-1092)

- **Status:** accepted
- **Date:** 2026-10-30

## Context

QA round 1 on DIDI-1001 noted that mutating exercise API handlers relied on SameSite=Lax session cookies and accepted JSON bodies without enforcing `Content-Type: application/json` or checking cross-site Origin. Better Auth routes are handled separately; this decision covers the app's own `/api/**` routes (excluding `/api/auth/**`).

## Decision

Before any authenticated mutating app API handler runs, `handleRequest` calls a single shared guard (`rejectMutatingAppApiCsrf` in `src/http/mutating-app-api-csrf.ts`) for `POST`, `PUT`, `PATCH`, and `DELETE` under `/api/` except Better Auth.

The guard:

1. Requires `Content-Type: application/json` (415 when missing or wrong).
2. Requires `Origin`, or `Referer` when Origin is absent, to match an allowed app origin: the request URL origin, `WEB_APP_BASE_URL`, or `AUTH_BASE_URL` (403 when missing or cross-site).
3. Returns only **403** or **415** with no new user-facing copy (existing JSON `{ error: "forbidden" }` for 403; empty body for 415).

`src/http/mutating-app-api-route-registry.ts` lists every mutating app API route sample; route-table tests fail if a new mutating route is added without registry coverage.

## Reasons

- One guard avoids per-handler drift and matches the portable `handleRequest` boundary.
- Origin plus JSON content type closes simple CSRF and content-sniffing gaps called out in QA without changing Better Auth.
- Allowed origins include the request host so local and Worker test hosts work alongside configured `WEB_APP_BASE_URL`.

## Consequences

- Browser and test clients must send `Content-Type: application/json` and a same-origin `Origin` (or `Referer`) on all mutating app API calls, including `DELETE`.
- **Security boundary:** merging requires **CTO head-pinned sign-off** at PR head (same rule as other auth/API boundary changes).
- GET app API routes and `/api/auth/**` are unchanged.
