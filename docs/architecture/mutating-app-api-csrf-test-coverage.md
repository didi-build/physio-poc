# Mutating app API CSRF guard test coverage (DIDI-1092)

Shared guard: `src/http/mutating-app-api-csrf.ts`, wired from `guardAndRun` in `src/http/app.ts`. Route registry: `src/http/mutating-app-api-route-registry.ts`.

## Mutation targets killed by tests (representative)

| Location                                                | Killing test                                                                               |
| ------------------------------------------------------- | ------------------------------------------------------------------------------------------ |
| `isMutatingAppApiPath` excludes `/api/auth/**`          | `test/mutating-app-api-csrf-unit.test.ts` Better Auth POST not guarded                     |
| `isApplicationJsonContentType` media type parse         | `test/mutating-app-api-csrf-unit.test.ts` charset suffix and text/plain                    |
| `requestSourceOrigin` Referer fallback                  | `test/mutating-app-api-csrf-unit.test.ts` Referer when Origin absent                       |
| `allowedMutatingAppApiOrigins` includes `webAppBaseUrl` | `test/mutating-app-api-csrf-unit.test.ts` app.example.com Origin on different request host |
| `rejectMutatingAppApiCsrf` cross-origin                 | `test/mutating-app-api-csrf.test.ts` every registry route returns 403                      |
| `rejectMutatingAppApiCsrf` wrong content type           | `test/mutating-app-api-csrf.test.ts` 415 on text/plain                                     |
| Guard wired in HTTP stack                               | `test/mutating-app-api-csrf.test.ts` same-origin JSON POST returns 200                     |
| Route registry completeness                             | `test/route-table.test.ts` pinned mutating route list                                      |

## Honest mutation survivors

| Location                                                             | Why it may survive                                                                                                                  |
| -------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| `parseHeaderOrigin` catch (`mutating-app-api-csrf.ts:38`)            | Malformed `Origin`/`Referer` values are rejected with 403, same as missing origin; tests assert status only, not distinct branches. |
| Separate 403 returns for missing vs disallowed origin (`:75`, `:78`) | Both yield 403 with `{ error: "forbidden" }`; merging branches is behavior-neutral.                                                 |
| `allowedMutatingAppApiOrigins` includes `auth.authBaseUrl` (`:28`)   | No test sends only `AUTH_BASE_URL` origin without request or web app origin; kept for dev auth host parity.                         |
| `isMutatingHttpMethod` includes `PUT`                                | No app API route uses PUT yet; predicate covered, no integration caller.                                                            |

Removing the guard call in `guardAndRun` fails `test/mutating-app-api-csrf.test.ts` cross-origin cases (200 instead of 403).
