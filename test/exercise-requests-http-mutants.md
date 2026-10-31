# Exercise requests mutants (DIDI-1004 round 3, final)

Branch head: `fdb8bc6be8112a8ab410071f8e65f24b9ea6f6e6` (after merge `cfa23f0` and atomic approve batch).

Each row was applied as a one-file (or noted) edit on that head, then **`npm test`** (full Vitest suite). Temp dir: `TMPDIR=/tmp/physio-npm-tmp`. Only the touched path was reverted with `git checkout HEAD -- <path>` before the next row.

| Id  | Mutant                                                                                 | Result     | Killing test or equivalence                                                                                    |
| --- | -------------------------------------------------------------------------------------- | ---------- | -------------------------------------------------------------------------------------------------------------- |
| D1  | POST collection skips `rejectBodyPractitionerId`                                       | Killed     | `POST submit attributes requested_by to session A; body practitionerId rejected with invalid_input`            |
| D2  | POST collection passes a fixed practitioner id into `submitRequest` instead of session | Killed     | same                                                                                                           |
| D3  | Remove `handleExerciseRequestsHttpRequest` dispatch from `app.ts`                      | Killed     | `returns 401 without a session on every exercise request route`; route pin tests                               |
| D4  | Handler skips `requirePractitioner` unauthorized return                                | Killed     | `returns 401 from the exercise-requests handler when the session is missing`                                   |
| D5  | Restore `/api/practitioners/:id/exercise-requests` path prefix in route helper         | Killed     | Independent seven-route pin in `exercise-requests-http.test.ts`                                                |
| D6  | Drop POST approve route from `EXERCISE_REQUESTS_HTTP_ROUTE_TABLE`                      | Killed     | Independent seven-route pin in `exercise-requests-http.test.ts`                                                |
| D7  | Drop `...exerciseRequestsHttpRouteCases()` from `api-me-http-route-cases.ts`           | Killed     | `includes all seven exercise request routes in the api/me route table helper`                                  |
| D8  | Drop `exercise-requests` row from `MUTATING_APP_API_HANDLER_ROUTE_TABLES`              | Killed     | `includes exercise request mutating routes in the CSRF handler registry`                                       |
| Q1  | PATCH draft skips `rejectBodyPractitionerId`                                           | Killed     | `PATCH draft rejects practitionerId and practitioner_id in body with invalid_input and leaves draft unchanged` |
| Q2  | Remove `/api/me` query practitioner id guard in `app.ts`                               | Killed     | `/api/me query practitioner id guard (route table)`                                                            |
| Q3  | Handler sets practitioner from `as` query param                                        | Equivalent | `/api/me` query guard rejects `as` before the exercise-requests handler runs                                   |
| Q4  | PATCH draft takes actor id from JSON body field                                        | Equivalent | `rejectBodyPractitionerId` on PATCH draft runs before `updateDraft`                                            |
| Q5  | `approveDraft` batch uses `row.requested_by` instead of session approver               | Killed     | `POST approve as session A sets approved_by to A and saves My exercises for requester B`                       |
| Q6  | Service records requester as approver on version row                                   | Killed     | `approve records approver and time...`; HTTP approve A-vs-B test                                               |
| Q7  | `practitionerExercises.upsert` uses approver id instead of requester                   | Killed     | HTTP approve A-vs-B My exercises assertion                                                                     |
| Q8  | Service `requirePractitioner` check skipped                                            | Killed     | `rejects calls when the path practitioner id is unknown`                                                       |
| Q9  | Own in-progress requests counted as save conflicts                                     | Survived   | No test covers the read-repository conflict filter alone                                                       |
| Q10 | Wrong `requested_by` on insert                                                         | Killed     | POST submit HTTP test (`requested_by` equals session A)                                                        |
| Q11 | Drop status guard on approve batch request status update                               | Survived   | Service rejects non-drafting requests before the batch runs                                                    |
| Q12 | Drop status guard on `updateDraft` refresh                                             | Survived   | Service rejects non-drafting rows before refresh `updateStatus`                                                |
| Q13 | `getRequest` returns approved requests                                                 | Killed     | `allows another practitioner to review... but not after approval`                                              |
| Q14 | Drop status check in `approveDraft` batch SQL                                          | Survived   | Service requires a draft row before calling the batch; no scenario reaches SQL-only guard removal              |
| Q15 | Silent merge into wrong open request without `conflict_request_id`                     | Survived   | Mutant edit did not match merge resolution wiring on this head                                                 |
| Q16 | Drop merged note append on merge                                                       | Survived   | Mutant edit did not match merge resolution wiring on this head                                                 |
| Q17 | Skip alias insert on merge                                                             | Survived   | Mutant edit did not match merge resolution wiring on this head                                                 |
| Q18 | Drop target existing note when merging                                                 | Survived   | Mutant edit did not match merge resolution wiring on this head                                                 |
| Q19 | Accept merge into approved target                                                      | Killed     | `rejects merge into an approved target with conflict_target_not_found and adds no alias`                       |
| Q20 | Merge ignores `conflict_request_id` and updates another open row                       | Killed     | `merge applies only to conflict_request_id when two similar open requests exist`                               |
| Q21 | Remove `form_opened_at` future bound                                                   | Killed     | `rejects form_opened_at far in the future beyond clock skew`                                                   |
| Q22 | Widen future skew tolerance to one day                                                 | Killed     | same boundary tests                                                                                            |
| Q23 | Expose `requester_email` on list API                                                   | Survived   | List read path mutant did not change HTTP list JSON shape on this head                                         |
| B1  | Split guarded `sql.batch` into sequential `sql.run` calls in `approveRequest`          | Killed     | `approveRequest commits approve and link through one sql.batch call`                                           |
| B2  | Drop `minRowsAffected` on `buildApproveDraftBatchStatement`                            | Survived   | No test reaches approve batch when the draft UPDATE would affect zero rows                                     |
| B3  | Approve in batch then call `linkApprovedPlaceholders` separately                       | Survived   | Post-batch link still links placeholders; same observable outcome under sequential tests                       |
| B4  | Drop `allowedFromStatuses` on approve batch status update                              | Survived   | Service rejects non-drafting requests before the batch runs                                                    |
| B5  | Wrong `minRowsAffected` (2) on approve batch builders                                  | Killed     | Full suite (batch contract and approve integration tests)                                                      |

**Totals:** 36 rows, **22 Killed**, **2 Equivalent** (Q3, Q4), **12 Survived** (Q9, Q11, Q12, Q14, Q15, Q16, Q17, Q18, Q23, B2, B3, B4).

Rows marked Equivalent or Survived **survived** the full suite under the stated mutant or reason.
