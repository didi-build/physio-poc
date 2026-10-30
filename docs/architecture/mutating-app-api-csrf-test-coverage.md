# Mutating app API CSRF guard test coverage (DIDI-1092)

Shared guard: `src/http/mutating-app-api-csrf.ts`, wired from `guardAndRun` in `src/http/app.ts`. Route registry: `src/http/mutating-app-api-route-registry.ts`. Unregistered mutating `/api/` requests are rejected with 404 before handlers (`isRegisteredMutatingAppApiRoute` in `src/http/mutating-app-api-route-gate.ts`).

`test/route-table.test.ts` for mutating app API routes enforces only:

- `MUTATING_APP_API_HANDLE_REQUEST_RULE_IDS` matches every `MUTATING_APP_API_HANDLER_ROUTE_TABLES` ruleId.
- Registry sample keys equal keys from `probedMutatingAppApiRouteKeys`, which calls `handleRequest` with a session and same-origin JSON on every mutating HTTP method for each registry path (non-404 responses count).
- A POST to an unregistered mutating `/api/` path returns 404 through `handleRequest`.

CSRF behavior on registered routes is covered separately in `test/mutating-app-api-csrf.test.ts` and unit tests.

## Mutation targets killed by tests (representative)

| Location                                                           | Killing test                                                           |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------- |
| `isMutatingAppApiPath` excludes `/api/auth/**`                     | `test/mutating-app-api-csrf-unit.test.ts` Better Auth POST not guarded |
| `isApplicationJsonContentType` exact `application/json` media type | unit charset, text/plain, form-urlencoded, multipart cases             |
| `requestSourceOrigin` Referer fallback                             | unit Referer when Origin absent                                        |
| `allowedMutatingAppApiOrigins` includes `webAppBaseUrl`            | unit app.example.com Origin on different request host                  |
| `allowedMutatingAppApiOrigins` includes `auth.authBaseUrl`         | unit Origin matches AUTH_BASE_URL only                                 |
| `rejectMutatingAppApiCsrf` cross-origin                            | `test/mutating-app-api-csrf.test.ts` every registry route returns 403  |
| `rejectMutatingAppApiCsrf` wrong content type                      | integration 415 on text/plain                                          |
| Guard wired in HTTP stack                                          | integration same-origin JSON POST returns 200                          |
| Registry matches `handleRequest` on registry paths                 | `test/route-table.test.ts` dispatch probe vs registry                  |
| Unregistered mutating `/api/` blocked                              | `test/route-table.test.ts` POST to unregistered path returns 404       |
| New `/api/` handler without registry ruleId                        | `test/route-table.test.ts` wired ruleIds vs tables                     |
| `DELETE` client sends JSON content type                            | `test/ui/exercise-library-client.test.ts`                              |

## Honest mutation survivors

| Location                                                              | Why it may survive                                                                                                                  |
| --------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `parseHeaderOrigin` catch (`mutating-app-api-csrf.ts:38`)             | Malformed `Origin`/`Referer` values are rejected with 403, same as missing origin; tests assert status only, not distinct branches. |
| Separate 403 returns for missing vs disallowed origin (`:75`, `:78`)  | Both yield 403 with `{ error: "forbidden" }`; merging branches is behavior-neutral.                                                 |
| Mutating route on an `/api/` path shape the gate parser does not know | Gate returns 404; probe only exercises registry paths, so drift on unknown shapes is not detected.                                  |
| `extraRouteHandlers` outside `/api/`                                  | Guard runs only in the `/api/` branch of `handleRequest`; documented in ADR 0007 consequences.                                      |

Removing the guard call in `guardAndRun` fails `test/mutating-app-api-csrf.test.ts` cross-origin cases (200 instead of 403).
