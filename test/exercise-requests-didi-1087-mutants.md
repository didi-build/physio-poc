# DIDI-1087 mutation table (getRequest read repository, Exercise note label)

Branch head at generation: `3d90fa9f0a2c619b1ce3f29453bac04ba1369599`. Temp dir: `TMPDIR=/tmp/didi-1087-tmp`.

Every row was applied alone, then the full Vitest suite was run with `npm test` (same suite as `npm run check` minus lint and typecheck). After each run, only the touched paths were reverted with `git checkout -- .` before the next mutant.

Field label check: API validation uses **Exercise note** per DIDI-1087 and QA physio-poc#20 round 1 non-blocker 6. The approved spec form copy for the same input is **Note for the AI (optional)** in `design/app/exercise-requests/spec.md` (Key copy and copy inventory); error messages use the ticket-scoped API label **Exercise note**, not the bare **Note** string.

## Mutant results (full suite)

| Id  | Mutant                                                                                                                                                                                         | Result | Killing test or equivalence                                                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `getRequest` uses `ExerciseRequestsRepository.findById` (no in-progress filter) and `ExerciseVersionsRepository.findDraftVersionDetailForExercise` instead of `ExerciseRequestsReadRepository` | Killed | `allows another practitioner to review an in-progress request but not after approval` in `test/exercise-requests-service.test.ts`                                               |
| M2  | `validateRequestNote` field label reverted to **Note** instead of **Exercise note**                                                                                                            | Killed | `rejects exercise notes that contain patient details`; `pins Exercise note as the field label when the note exceeds the max length` in `test/exercise-requests-service.test.ts` |
| M3  | POST submit drops `rejectBodyPractitionerId` (body `practitionerId` / `practitioner_id` silently accepted)                                                                                     | Killed | `POST submit attributes requested_by to session A; body practitionerId rejected with invalid_input` in `test/exercise-requests-http.test.ts`                                    |

## Totals

| Result     | Count |
| ---------- | ----- |
| Killed     | 3     |
| Equivalent | 0     |
| Survived   | 0     |
