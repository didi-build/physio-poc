# Mutating app API CSRF guard test coverage (DIDI-1092)

Shared guard: `src/http/mutating-app-api-csrf.ts`. Wired at the start of the `/api/` branch in `src/http/app.ts` before dispatch (see [CTO ruling faa8d286](https://linear.app/didi-build/issue/DIDI-1092#comment-faa8d286)).

Production enforces only:

- Non-safe methods (not GET, HEAD, or OPTIONS) under `/api/**` except paths under `CSRF_EXEMPT_APP_API_AUTH_PREFIX` (`/api/auth` exact prefix).
- JSON `Content-Type`, allowed `Origin` or `Referer`, 403 or 415 only.

`test/helpers/mutating-app-api-route-registry.ts` and optional dispatch probe helpers are test-only.

## What `test/mutating-app-api-csrf.test.ts` and unit tests enforce

| Behavior                                           | Test                                                                 |
| -------------------------------------------------- | -------------------------------------------------------------------- |
| Cross-origin non-safe `/api/` requests return 403  | handleRequest on registry samples and `/api/__probe_new_route`       |
| Unregistered path gets 403 not 404 when CSRF fails | POST `/api/__probe_new_route` cross-origin with session              |
| POST, PUT, PATCH, DELETE, PROPFIND covered         | loop on `/api/__probe_new_route`                                     |
| `/api/auth/**` exempt                              | `rejectMutatingAppApiCsrf` on `/api/auth/sign-out`                   |
| `/api/authx` and `/api/auth-like` not exempt       | handleRequest POST with cross-origin                                 |
| GET, HEAD, OPTIONS not CSRF rejected               | `requiresAppApiCsrfGuard` false; handleRequest status not 403 or 415 |
| Sole exemption prefix pinned                       | `CSRF_EXEMPT_APP_API_AUTH_PREFIX === "/api/auth"`                    |
| JSON content type and origin rules                 | unit and integration cases                                           |
| Known routes extra coverage                        | test-only `MUTATING_APP_API_ROUTE_SAMPLES`                           |

Removing the `/api/` CSRF call in `app.ts` or widening the exemption prefix should fail the tests above.

## Honest mutation survivors

| Location                                              | Why it may survive                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `parseHeaderOrigin` catch                             | Malformed Origin/Referer yields 403 like missing origin; tests assert status only. |
| Separate 403 returns for missing vs disallowed origin | Same status and JSON body if merged.                                               |
| `extraRouteHandlers` outside `/api/`                  | Guard runs only in the `/api/` branch; see ADR 0007 consequences.                  |

Removing the guard call in `app.ts` fails cross-origin and unregistered-path handleRequest cases (404 or 200 instead of 403).
