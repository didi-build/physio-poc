# DIDI-1059 session routes mutants (PR #73)

Branch head at generation time: `0d42c0e` (update on each push). Temp dir: `TMPDIR=/tmp/didi-1059-tmp`. Each row applied one production or guard change, ran the full suite (`npm test` or `npm run test:worker` as noted), then reverted with `git checkout -- .` before the next row. No single-file test filters were used for mutant verdicts.

## Totals

| Outcome    | Count |
| ---------- | ----- |
| Run        | 19    |
| Killed     | 16    |
| Survived   | 2     |
| Equivalent | 1     |

Every mutant was run against the full suite for that row (1876+ vitest tests for `npm test`, 104 tests for `npm run test:worker`).

## Mutant results

| Id  | Mutant                                                                                                                     | Suite               | Result     | Killing test or notes                                                                                    |
| --- | -------------------------------------------------------------------------------------------------------------------------- | ------------------- | ---------- | -------------------------------------------------------------------------------------------------------- |
| M1  | `exercise-library.ts`: skip `requirePractitioner` unauthorized return (`if (false && practitionerId instanceof Response)`) | npm test            | Killed     | `exercise-library-null-session-direct.test.ts` null session 401                                          |
| M2  | `exercise-media.ts`: skip all `requirePractitioner` unauthorized returns                                                   | npm test            | Killed     | `exercise-media-practitioner-access.test.ts` direct handler 401 without session                          |
| M3  | `exercise-library.ts`: PATCH `rejectBodyPractitionerId` replaced with `null`                                               | npm test            | Killed     | `practitioner-path-route-table.test.ts` body practitionerId 400                                          |
| M4  | `exercise-media.ts`: all `rejectBodyPractitionerId` replaced with `null`                                                   | npm test            | Killed     | `practitioner-path-route-table.test.ts` exercise-media body practitioner_id 400                          |
| M5  | `exercise-library.ts`: append comment containing `/api/practitioners/`                                                     | npm test            | Killed     | `practitioner-path-route-table.test.ts` forbids practitioner id path segments                            |
| M6  | `exercise-library.ts`: legacy `/api/practitioners/:id/my-exercises/:id` DELETE without session binding                     | npm test            | Killed     | `api-me-query-guard.test.ts`; legacy path handling                                                       |
| M7  | `no-practitioner-id-in-http-path.ts`: guard disabled plus `/api/practitioners/` comment in `exercise-media.ts`             | npm test            | Survived   | Full suite passed; path id can sneak in if guard is broken                                               |
| M8  | `exercise-library.ts`: all `if (rejected)` checks forced false                                                             | npm test            | Killed     | `practitioner-path-route-table.test.ts` body practitionerId 400                                          |
| M9  | `exercise-library.ts`: replace `requirePractitioner` with optional session fallback id                                     | npm test            | Killed     | `exercise-library-null-session-direct.test.ts`                                                           |
| M10 | `exercise-media.ts`: skip unauthorized return on handler (worker-focused)                                                  | npm run test:worker | Equivalent | Worker entry `guardAndRun` returns 401 before handler; mutant does not change worker observable behavior |
| M11 | `exercise-library-api-paths.ts`: my-exercises path under `/api/practitioners/:id/`                                         | npm test            | Killed     | `auth-practitioner-id-binding.test.ts` session my-exercises URL                                          |
| M12 | `no-practitioner-id-in-http-path.ts`: guard disabled plus `/api/practitioners/` comment in `exercise-library.ts`           | npm test            | Survived   | Full suite passed; path id can sneak in if guard is broken                                               |
| M13 | `exercise-media.ts`: replace `requirePractitioner` with fallback id without 401                                            | npm test            | Killed     | `exercise-media-practitioner-access.test.ts` direct handler 401                                          |
| M15 | `exercise-library.ts`: `/api/me` DELETE uses row owner practitioner id instead of session                                  | npm test            | Killed     | Cross-practitioner isolation and related HTTP guards                                                     |
| M16 | `exercise-library.ts`: approved search uses fixed practitioner id, no session gate                                         | npm test            | Killed     | `auth-practitioner-id-binding.test.ts` my-exercises session URL                                          |
| M17 | `exercise-media.ts`: version media routes use fallback id without 401                                                      | npm test            | Killed     | `exercise-media-practitioner-access.test.ts` direct handler 401                                          |
| M18 | `exercise-library.ts`: `rejectSpoofedPractitionerIdInBody` always returns null via `rejectBodyPractitionerId` stub         | npm test            | Killed     | Body practitionerId guards (library and downstream suites)                                               |
| M19 | `exercise-library-api-paths.ts`: approved search path under `/api/practitioners/:id/`                                      | npm test            | Killed     | `exercise-library-null-session-direct.test.ts` and client path expectations                              |
| M20 | `exercise-library.ts`: `isExerciseLibraryApiPath` also matches `/api/practitioners/.../my-exercises`                       | npm test            | Killed     | `practitioner-path-route-table.test.ts` forbids practitioner id path segments                            |

## Required coverage mapping

| Requirement                                                         | Mutants                   |
| ------------------------------------------------------------------- | ------------------------- |
| Drop `requirePractitioner` on library or media handler              | M1, M2, M9, M13, M16, M17 |
| Accept body with `practitionerId` / `practitioner_id` (skip reject) | M3, M4, M8, M18           |
| Leave `/api/practitioners/` in production `src/http`                | M5, M6, M20               |
| A-vs-B reaches other practitioner data                              | M6, M15                   |
| Break `no-practitioner-id-in-http-path` helper                      | M7, M12                   |
