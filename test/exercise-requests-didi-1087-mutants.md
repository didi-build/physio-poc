# DIDI-1087 mutation table (getRequest read repository, NOTE_FOR_AI label)

Branch head at generation: `c4f4bebf9ba550a749bde2e60206c6dd3595b659`. Temp dir: `TMPDIR=/tmp/didi-1087-tmp`.

Every row was applied alone, then the full Vitest suite was run with `npm test`. After each run, only the touched paths were reverted with `git checkout -- .` before the next mutant.

Field label check (CTO f0eea5c7): API validation uses the existing `NOTE_FOR_AI` constant from `src/ui/copy/exercise-library.ts` (value from spec copy inventory).

## Mutant results (full suite)

| Id  | Mutant                                                                                                                                                                                         | Result | Killing test or equivalence                                                                                                                                    |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `getRequest` uses `ExerciseRequestsRepository.findById` (no in-progress filter) and `ExerciseVersionsRepository.findDraftVersionDetailForExercise` instead of `ExerciseRequestsReadRepository` | Killed | `allows another practitioner to review an in-progress request but not after approval` in `test/exercise-requests-service.test.ts`                              |
| M2  | `validateRequestNote` uses bare string **Note** instead of `NOTE_FOR_AI`                                                                                                                       | Killed | `uses NOTE_FOR_AI in validateRequestNote max-length errors`; `rejects exercise notes that contain patient details` in `test/exercise-requests-service.test.ts` |
| M3  | POST submit drops `rejectBodyPractitionerId` (body `practitionerId` / `practitioner_id` silently accepted)                                                                                     | Killed | `POST submit attributes requested_by to session A; body practitionerId rejected with invalid_input` in `test/exercise-requests-http.test.ts`                   |

## Totals

| Result     | Count |
| ---------- | ----- |
| Killed     | 3     |
| Equivalent | 0     |
| Survived   | 0     |
