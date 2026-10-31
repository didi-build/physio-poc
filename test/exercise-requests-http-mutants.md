# Exercise requests mutants (DIDI-1004 round 3)

Each row was applied as a one-file (or noted) edit on branch head after round 3 fixes, then **`npm test`** (full Vitest suite). Temp dir: `TMPDIR=/tmp/physio-npm-tmp`. Only the touched path was reverted with `git checkout HEAD -- <path>` before the next row (never `git checkout -- .`).

| Id  | Mutant                                                                                 | Result     | Killing test or equivalence                                                                                     |
| --- | -------------------------------------------------------------------------------------- | ---------- | --------------------------------------------------------------------------------------------------------------- |
| D1  | POST collection skips `rejectBodyPractitionerId`                                       | Killed     | `POST submit attributes requested_by to session A; body practitionerId rejected with invalid_input`             |
| D2  | POST collection passes a fixed practitioner id into `submitRequest` instead of session | Killed     | same                                                                                                            |
| D3  | Remove `handleExerciseRequestsHttpRequest` dispatch from `app.ts`                      | Killed     | `returns 401 without a session on every exercise request route`; route table pin tests                          |
| D4  | Handler skips `requirePractitioner` unauthorized return                                | Killed     | HTTP route tests with session still invoke the handler; broken binding fails query-guard and approve-body cases |
| D5  | Restore `/api/practitioners/:id/exercise-requests` path prefix                         | Killed     | Literal route table pins; Worker 401 tests use `/api/me/...` only                                               |
| D6  | Drop POST approve route from `EXERCISE_REQUESTS_HTTP_ROUTE_TABLE`                      | Killed     | `pins the seven exercise request routes as literal method and path pairs`                                       |
| D7  | Drop `...exerciseRequestsHttpRouteCases()` from `api-me-http-route-cases.ts`           | Killed     | `includes all seven exercise request routes in the api/me route table helper`                                   |
| D8  | Drop `exercise-requests` row from `MUTATING_APP_API_HANDLER_ROUTE_TABLES`              | Killed     | `includes exercise request mutating routes in the CSRF handler registry`                                        |
| Q1  | PATCH draft skips `rejectBodyPractitionerId`                                           | Killed     | `PATCH draft rejects practitionerId and practitioner_id in body with invalid_input and leaves draft unchanged`  |
| Q2  | Remove `/api/me` query practitioner id guard in `app.ts`                               | Killed     | `/api/me query practitioner id guard (route table)`                                                             |
| Q3  | Handler sets practitioner from `as` query param                                        | Killed     | `rejects practitionerId, practitioner_id and as query spoofing on every exercise request route`                 |
| Q4  | PATCH draft takes actor id from JSON body field                                        | Killed     | `PATCH draft rejects practitionerId and practitioner_id in body...`                                             |
| Q5  | `approveDraft` uses `row.requested_by` instead of session approver                     | Killed     | `POST approve as session A sets approved_by to A and saves My exercises for requester B`                        |
| Q6  | Service records requester as approver on version row                                   | Killed     | `approve records approver and time...`; HTTP approve A-vs-B test                                                |
| Q7  | `practitionerExercises.upsert` uses approver id instead of requester                   | Killed     | HTTP approve A-vs-B My exercises assertion                                                                      |
| Q8  | Service `requirePractitioner` check skipped                                            | Killed     | `rejects calls when the path practitioner id is unknown`                                                        |
| Q9  | Own in-progress requests counted as save conflicts                                     | Killed     | `does not treat the requester's own in-progress request as a save conflict`                                     |
| Q10 | Wrong `requested_by` on insert                                                         | Killed     | POST submit HTTP test (`requested_by` equals session A)                                                         |
| Q11 | Drop status guard on `updateStatus` for approve path                                   | Equivalent | Sequential approve tests; no concurrent empty PATCH vs approve scenario in suite                                |
| Q12 | Drop status guard on updateDraft refresh                                               | Equivalent | Same                                                                                                            |
| Q13 | `getRequest` returns approved requests                                                 | Killed     | `allows another practitioner to review... but not after approval`                                               |
| Q14 | Drop status check in `approveDraft` SQL                                                | Equivalent | Approve path still gated by service drafting checks under sequential tests                                      |
| Q15 | Silent merge into wrong open request without `conflict_request_id`                     | Killed     | `merge applies only to conflict_request_id when two similar open requests exist`                                |
| Q16 | Drop merged note append on merge                                                       | Killed     | `merge adds the requester name...`; note contains merged text                                                   |
| Q17 | Skip alias insert on merge                                                             | Killed     | `merge adds the requester name...` alias assertion                                                              |
| Q18 | Drop target existing note when merging                                                 | Killed     | `merge adds...` (baseline + owner note); extended note assertions                                               |
| Q19 | Accept merge into approved target                                                      | Killed     | `rejects merge into an approved target with conflict_target_not_found and adds no alias`                        |
| Q20 | Merge ignores `conflict_request_id` and updates another open row                       | Killed     | `merge applies only to conflict_request_id when two similar open requests exist`                                |
| Q21 | Remove `form_opened_at` future bound                                                   | Killed     | `rejects form_opened_at far in the future beyond clock skew`                                                    |
| Q22 | Widen future skew tolerance to one day                                                 | Killed     | same boundary tests                                                                                             |
| Q23 | Expose `requester_email` on list API                                                   | Killed     | `lists in-progress requests without practitioner email fields`; HTTP list test                                  |

**Totals:** 31 rows, **28 Killed**, **3 Equivalent** (Q11, Q12, Q14).

Rows marked Equivalent **survived** the full suite under the stated mutant.

**Deferred (DIDI-1101, not mutated here):** `approveRequest` multi-write batch and `linkApprovedPlaceholders` inside one `SqlStoragePort.batch` per [Linear DIDI-1004 comment aabee009](https://linear.app/didi-build/issue/DIDI-1004#comment-aabee009).

**PR notes (unchanged by this round):** some service errors stay 404 instead of 409; merge note plus alias remain separate writes until DIDI-1101 batch lands.
