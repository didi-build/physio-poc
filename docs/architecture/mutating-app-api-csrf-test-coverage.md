# Mutating app API CSRF guard test coverage (DIDI-1092)

Shared guard: `src/http/mutating-app-api-csrf.ts`. Auth-only paths: `AUTH_APP_API_PREFIX` (`/api/auth/` with trailing slash) in `src/auth/auth-app-api-prefix.ts`. Wired in `src/http/app.ts` (see [CTO ruling faa8d286](https://linear.app/didi-build/issue/DIDI-1092#comment-faa8d286) and [follow-up 47311a43](https://linear.app/didi-build/issue/DIDI-1092#comment-47311a43)).

Production enforces only:

- Non-safe methods (not GET, HEAD, or OPTIONS) under `/api/**` except paths under `CSRF_EXEMPT_APP_API_AUTH_PREFIX` (`/api/auth/`). Bare `/api/auth` is not exempt. Matching is case-sensitive on the prefix string.
- Requests under `/api/auth/` are handled only by the auth port; if the port does not serve the path, `handleRequest` returns 404 with no app dispatch.
- JSON `Content-Type`, allowed `Origin` or `Referer`, 403 or 415 only.

`test/helpers/mutating-app-api-route-registry.ts` and optional dispatch probe helpers are test-only.

## What `test/mutating-app-api-csrf.test.ts` and unit tests enforce

| Behavior                                           | Test                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| Cross-origin non-safe `/api/` requests return 403  | handleRequest on registry samples and `/api/__probe_new_route`                             |
| Unregistered path gets 403 not 404 when CSRF fails | POST `/api/__probe_new_route` cross-origin with session; body `{ error: "forbidden" }`     |
| CSRF before dispatch on unregistered path          | same-origin POST on probe path returns 404 `{ error: "not_found" }`                        |
| Lowercase non-standard methods guarded             | handleRequest `patch` and `propfind` cross-origin on probe path                            |
| POST, PUT, PATCH, DELETE, PROPFIND covered         | loop on `/api/__probe_new_route`                                                           |
| `/api/auth/**` exempt (trailing slash prefix)      | handleRequest POST `/api/auth/sign-out` cross-origin; unit `rejectMutatingAppApiCsrf`      |
| Bare `/api/auth` and `/api/auth?x` not exempt      | handleRequest POST cross-origin with session                                               |
| Case-mismatched `/api/auth/` not exempt            | POST `/api/AUTH/x` and `/api/Auth/sign-out` cross-origin with session                      |
| `/api/authx` and `/api/auth-like` not exempt       | handleRequest POST with cross-origin                                                       |
| Auth fallthrough to app dispatch                   | POST `/api/auth/zzz` with auth null stub and catch-all `extraRouteHandlers`; probe not run |
| Removing handleRequest 404 for `/api/auth/`        | same test (catch-all would return `{ error: "catch_all_ran" }`)                            |
| FakeAuthPort null for unknown auth path            | unit: `FakeAuthPort.handleAuthRequest` on `/api/auth/zzz` returns 404 body, not null       |
| GET, HEAD, OPTIONS not CSRF rejected               | `requiresAppApiCsrfGuard` false; handleRequest status not 403 or 415                       |
| Sole exemption prefix pinned                       | `CSRF_EXEMPT_APP_API_AUTH_PREFIX === "/api/auth/"`                                         |
| JSON content type and origin rules                 | unit and integration cases                                                                 |
| Known routes extra coverage                        | test-only `MUTATING_APP_API_ROUTE_SAMPLES`                                                 |
| `/api/auth/` not in guarded-api route samples      | `test/route-table.test.ts`                                                                 |

Removing the `/api/` CSRF call in `app.ts`, widening the exemption to bare `/api/auth`, case-insensitive prefix matching, or falling through from `/api/auth/` to app dispatch should fail the tests above.

## Honest mutation survivors

| Location                                              | Why it may survive                                                                 |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `parseHeaderOrigin` catch                             | Malformed Origin/Referer yields 403 like missing origin; tests assert status only. |
| Separate 403 returns for missing vs disallowed origin | Same status and JSON body if merged.                                               |
| `extraRouteHandlers` outside `/api/`                  | Guard runs only in the `/api/` branch; see ADR 0007 consequences.                  |

Removing the guard call in `app.ts` fails cross-origin and unregistered-path handleRequest cases (404 or 200 instead of 403). Treating bare `/api/auth` as exempt fails bare-path CSRF tests. Case-insensitive `isAuthAppApiPath` fails `/api/AUTH/x` and `/api/Auth/sign-out` tests. Auth fallthrough, dropping the `/api/auth/` 404 in `app.ts`, or `FakeAuthPort` returning null for unknown paths fails the catch-all probe test or the FakeAuthPort unit test.
