# Mutating app API CSRF guard test coverage (DIDI-1092)

Shared guard: `src/http/mutating-app-api-csrf.ts`, wired from `guardAndRun` in `src/http/app.ts`. Route registry: `src/http/mutating-app-api-route-registry.ts`.

Handler modules export mutating route tables (`exerciseLibraryMutatingHttpRouteCases`, `exerciseMediaHttpRouteCases`). The registry merges `MUTATING_APP_API_HANDLER_ROUTE_TABLES` into `MUTATING_APP_API_ROUTE_SAMPLES`. Tests fail if a handler table adds a route that is not reflected in the built registry (see `test/mutating-app-api-route-registry.test.ts` simulated mutant).

## Mutation targets killed by tests (representative)

| Location                                                           | Killing test                                                               |
| ------------------------------------------------------------------ | -------------------------------------------------------------------------- |
| `isMutatingAppApiPath` excludes `/api/auth/**`                     | `test/mutating-app-api-csrf-unit.test.ts` Better Auth POST not guarded     |
| `isApplicationJsonContentType` exact `application/json` media type | unit charset, text/plain, form-urlencoded, multipart cases                 |
| `requestSourceOrigin` Referer fallback                             | unit Referer when Origin absent                                            |
| `allowedMutatingAppApiOrigins` includes `webAppBaseUrl`            | unit app.example.com Origin on different request host                      |
| `allowedMutatingAppApiOrigins` includes `auth.authBaseUrl`         | unit Origin matches AUTH_BASE_URL only                                     |
| `rejectMutatingAppApiCsrf` cross-origin                            | `test/mutating-app-api-csrf.test.ts` every registry route returns 403      |
| `rejectMutatingAppApiCsrf` wrong content type                      | integration 415 on text/plain                                              |
| Guard wired in HTTP stack                                          | integration same-origin JSON POST returns 200                              |
| Handler route tables merged into registry                          | `test/route-table.test.ts`, `test/mutating-app-api-route-registry.test.ts` |
| `DELETE` client sends JSON content type                            | `test/ui/exercise-library-client.test.ts`                                  |

## Honest mutation survivors

| Location                                                             | Why it may survive                                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `parseHeaderOrigin` catch (`mutating-app-api-csrf.ts:38`)            | Malformed `Origin`/`Referer` values are rejected with 403, same as missing origin; tests assert status only, not distinct branches. |
| Separate 403 returns for missing vs disallowed origin (`:75`, `:78`) | Both yield 403 with `{ error: "forbidden" }`; merging branches is behavior-neutral.                                                 |
| `PUT` guarded with no PUT app API route yet                          | `isMutatingAppApiPath` and unit PUT case only; no handler declares PUT.                                                             |
| `extraRouteHandlers` outside `/api/`                                 | Guard runs only in the `/api/` branch of `handleRequest`; documented in ADR 0007 consequences.                                      |

Removing the guard call in `guardAndRun` fails `test/mutating-app-api-csrf.test.ts` cross-origin cases (200 instead of 403).
