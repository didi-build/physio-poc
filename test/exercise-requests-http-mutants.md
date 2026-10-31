# Exercise requests HTTP mutants (DIDI-1004 round 2)

Re-run on branch after `/api/me` route move: each row was applied as a one-file production edit, then **`npx vitest run`** (full suite). Temp dir: `TMPDIR=/tmp/didi-1004-mutants`. Production edits were reverted with `git checkout` on the touched file only before the next row.

| Mutant                                                                                 | Killing test or equivalence                                                                                                                        | Result     |
| -------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| `handleExerciseRequestsHttpRequest` POST skips `rejectBodyPractitionerId`              | `POST submit attributes requested_by to session A; body practitionerId rejected with invalid_input`                                                | Killed     |
| POST collection passes a fixed practitioner id into `submitRequest` instead of session | `POST submit attributes requested_by to session A; body practitionerId rejected with invalid_input`                                                | Killed     |
| Remove `handleExerciseRequestsHttpRequest` dispatch from `app.ts`                      | `returns 401 for exercise request API routes without a session on the Worker entry`; `pins exerciseRequestsHttpRouteCases in the test helper list` | Killed     |
| `handleExerciseRequestsHttpRequest` skips `requirePractitioner` null check             | Equivalent: `guardAndRun` returns 401 on unauthenticated `/api/` before handlers; Worker 401 route table does not observe handler-level binding    | Equivalent |
| Restore `/api/practitioners/:id/exercise-requests` path prefix in handler              | `pins exerciseRequestsHttpRouteCases in the test helper list`; Worker 401 tests use `/api/me/...` only                                             | Killed     |
| Remove exercise request routes from `exerciseRequestsHttpRouteCases` helper            | `pins exerciseRequestsHttpRouteCases in the test helper list`                                                                                      | Killed     |
| Remove exercise request routes from `apiMeHttpRouteCases` merge                        | `/api/me query practitioner id guard (route table)` table test                                                                                     | Killed     |
| Omit `exercise-requests` table from `MUTATING_APP_API_HANDLER_ROUTE_TABLES`            | `mutating-app-api-csrf` registry parity tests                                                                                                      | Killed     |

Rows marked Equivalent were confirmed to **survive** the full suite under the stated mutant; behavior is already enforced elsewhere as described.
