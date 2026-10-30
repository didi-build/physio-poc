# Mutating app API CSRF guard test coverage (DIDI-1092)

Shared guard: `src/http/mutating-app-api-csrf.ts`. Auth-only paths: `AUTH_APP_API_PREFIX` (`/api/auth/` with trailing slash) in `src/auth/auth-app-api-prefix.ts`. Wired in `src/http/app.ts` (see [CTO ruling 4662191a](https://linear.app/didi-build/issue/DIDI-1092#comment-4662191a), [faa8d286](https://linear.app/didi-build/issue/DIDI-1092#comment-faa8d286), and [47311a43](https://linear.app/didi-build/issue/DIDI-1092#comment-47311a43)).

Production enforces only:

- Non-safe methods (not GET, HEAD, or OPTIONS) whose path lowercases to `/api/**`, except paths that start case-sensitively with `AUTH_APP_API_PREFIX`. Bare `/api/auth` is not exempt. Auth exemption uses `isAuthAppApiPath` (case-sensitive); CSRF scope uses a lowercased path prefix check only.
- `handleRequest` `/api/` dispatch stays case-sensitive (`pathname.startsWith("/api/")`). Mixed-case non-safe paths run CSRF before dispatch via an early guard when they are outside that branch.
- Requests under `/api/auth/` are handled only by the auth port; if the port does not serve the path, `handleRequest` returns 404 with no app dispatch.
- JSON `Content-Type`, allowed `Origin` or `Referer`, 403 or 415 only.

`test/helpers/mutating-app-api-route-registry.ts` and optional dispatch probe helpers are test-only.

## What `test/mutating-app-api-csrf.test.ts` and unit tests enforce

| Behavior                                           | Test                                                                                                                                                       |
| -------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Cross-origin non-safe `/api/` requests return 403  | handleRequest on registry samples and `/api/__probe_new_route`                                                                                             |
| Unregistered path gets 403 not 404 when CSRF fails | POST `/api/__probe_new_route` cross-origin with session; body `{ error: "forbidden" }`                                                                     |
| CSRF before dispatch on unregistered path          | same-origin POST on probe path returns 404 `{ error: "not_found" }`                                                                                        |
| Lowercase non-standard methods guarded             | handleRequest `patch` and `propfind` cross-origin on probe path                                                                                            |
| POST, PUT, PATCH, DELETE, PROPFIND covered         | loop on `/api/__probe_new_route`                                                                                                                           |
| `/api/auth/**` exempt (trailing slash prefix)      | handleRequest POST `/api/auth/sign-out` cross-origin; unit `rejectMutatingAppApiCsrf`                                                                      |
| Bare `/api/auth` and `/api/auth?x` not exempt      | handleRequest POST cross-origin with session                                                                                                               |
| Case-mismatched auth API paths not exempt          | POST `/API/AUTH/x` and `/Api/Auth/x` cross-origin with session; storage unchanged                                                                          |
| Mixed-case GET without session not JSON 401        | GET `/API/foo` returns 302 to sign-in (case-sensitive `/api/` routing unchanged)                                                                           |
| `/api/authx` and `/api/auth-like` not exempt       | handleRequest POST with cross-origin                                                                                                                       |
| Auth fallthrough to app dispatch                   | POST `/api/auth/zzz` with auth null stub and catch-all `extraRouteHandlers`; probe not run                                                                 |
| Removing handleRequest 404 for `/api/auth/`        | same test (catch-all would return `{ error: "catch_all_ran" }`)                                                                                            |
| FakeAuthPort null for unknown auth path            | unit: `FakeAuthPort.handleAuthRequest` on `/api/auth/zzz` returns 404 body, not null                                                                       |
| GET, HEAD, OPTIONS not CSRF rejected               | `requiresAppApiCsrfGuard` false; handleRequest status not 403 or 415                                                                                       |
| Sole exemption prefix pinned                       | `AUTH_APP_API_PREFIX === "/api/auth/"`                                                                                                                     |
| Each configured allowed Origin accepted            | handleRequest POST with fixture literals `https://physio.test.example`, `https://app.example.com`, `http://127.0.0.1:8787` (not read from production list) |
| JSON content type and origin rules                 | unit and integration cases                                                                                                                                 |
| Origin allow exact match (not `startsWith`)        | handleRequest Origin look-alikes (suffix and different port) per fixture origin                                                                            |
| Referer look-alike without Origin                  | handleRequest Referer with allowed-host `.attacker.example` suffix; storage unchanged                                                                      |
| Form content types 415 through handleRequest       | POST with urlencoded and multipart; practitioner_exercises row count unchanged                                                                             |
| Known routes extra coverage                        | test-only `MUTATING_APP_API_ROUTE_SAMPLES`                                                                                                                 |
| `/api/auth/` not in guarded-api route samples      | `test/route-table.test.ts`                                                                                                                                 |

Removing the `/api/` CSRF call in `app.ts`, widening the exemption to bare `/api/auth`, case-insensitive `isAuthAppApiPath`, case-insensitive `/api/` routing in `app.ts`, falling through from `/api/auth/` to app dispatch, dropping an allowed origin from production config, or using `startsWith` instead of exact origin matching should fail the tests above.

## Honest mutation survivors

| Location                                                | Why it may survive                                                                 |
| ------------------------------------------------------- | ---------------------------------------------------------------------------------- |
| `parseHeaderOrigin` catch                               | Malformed Origin/Referer yields 403 like missing origin; tests assert status only. |
| Separate 403 returns for missing vs disallowed origin   | Same status and JSON body if merged.                                               |
| `extraRouteHandlers` outside `/api/`                    | Guard runs only in the `/api/` branch; see ADR 0007 consequences.                  |
| Same-value duplicate `/api/auth/` literal in CSRF guard | Not testable by behaviour; enforced by review `rg` for one literal in `src`.       |

## Mutants killed by this suite (manual verification)

| Mutant                                                        | Killing test                                                            |
| ------------------------------------------------------------- | ----------------------------------------------------------------------- |
| Case-insensitive `isAuthAppApiPath` (lowercased prefix match) | POST `/API/AUTH/x` and `/Api/Auth/x` cross-origin with session          |
| Exemption prefix without trailing slash                       | pin `AUTH_APP_API_PREFIX === "/api/auth/"`; bare `/api/auth` CSRF tests |
| Case-insensitive `/api/` routing in `app.ts`                  | GET `/API/foo` without session returns 302 to sign-in                   |
| Drop one origin from `allowedMutatingAppApiOrigins`           | fixture literal accept loop in Origin look-alike test                   |
| Replace exact origin `Set.has` with `startsWith`              | Origin and Referer look-alike handleRequest tests                       |

Removing the guard call in `app.ts` fails cross-origin and unregistered-path handleRequest cases (404 or 200 instead of 403). Treating bare `/api/auth` as exempt fails bare-path CSRF tests. Auth fallthrough, dropping the `/api/auth/` 404 in `app.ts`, or `FakeAuthPort` returning null for unknown paths fails the catch-all probe test or the FakeAuthPort unit test.
