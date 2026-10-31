# Routines data model test coverage (DIDI-1017)

QA mutation and guard coverage notes for `src/storage/repositories/routines.ts`, routine validators in `src/domain/exercise-free-text.ts`, program origin updates in `src/storage/repositories/programs.ts`, and migration `0005_routine_data_model.sql`.

## Atomic writes (DIDI-1098)

`createDraft`, `publishDraft`, `savePublishedVersion` and `saveFrozenCopy` each submit one guarded `SqlStoragePort.batch()`. A guard that matches too few rows rolls the whole batch back and surfaces as `RoutineRepositoryError` with `code: "stale_write"` (the `SqlBatchGuardError` is kept as `cause`). Tests live in `test/routine-batch-didi-1098-atomicity.test.ts`.

- **Frozen copies pin the current published version.** `saveFrozenCopy` only succeeds when `sourceRoutineVersionId` is the routine's current `published_version`; copying an older version fails with `stale_write` and writes nothing.
- **`InMemorySqlStorage` limits:** it cannot run `INSERT ... SELECT` or several of the read queries, so repository-path atomicity tests run on better-sqlite3 and the D1 fake only.
- **Still non-atomic:** `updateDraftMetadata` and `replaceDraftRow` make two writes each (not covered by DIDI-1098).

## Unreachable post-insert re-reads (mutation survivors by design)

These branches re-load a row that the statement immediately before wrote with the same primary key. They remain uncovered by meaningful behaviour tests:

- `routines.ts:242` after `createDraft` insert
- `routines.ts:379` after `publishDraft` update
- `routines.ts:460` after `savePublishedVersion` insert path
- `routines.ts:656` after `saveFrozenCopy` insert

## Now unreachable through the API

- **`routines.ts` `publishDraft` and `replaceDraftRow` "Draft version not found" branches:** these were reachable only after a partial `createDraft` write. Since `createDraft` is atomic (DIDI-1098), no test reaches them and they are defensive guards.

## Mutation targets killed by tests (representative)

| Location                                                               | Killing test                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hasCommunityUpdateFlag` (`routines.ts:669`, `>` vs `>=`)              | `test/routine-data-model.test.ts` practitioner frozen copies test (false at same version, false when `published_version` is null, true after v2) |
| `listDraftsForAuthor` (`routines.ts:178`, `published_version IS NULL`) | `test/routine-data-model.test.ts` keeps draft routines visible only to the author                                                                |
| `validateConditionLabel` trim (`exercise-free-text.ts:168`)            | `test/routine-data-model-guard-coverage.test.ts` stores a padded condition label trimmed                                                         |
| `setRoutineOrigin` soft-delete guard (`programs.ts:284`)               | `test/routine-data-model-qa-round2.test.ts` missing and soft-deleted program cases                                                               |
| Version pinning and opaque id guards                                   | `test/routine-data-model-guard-coverage.test.ts`, `test/routine-data-model-qa-round1.test.ts`, schema constraint tests                           |

See also guard tables in `test/routine-data-model-guard-coverage.test.ts` and QA round 1 notes in `test/routine-data-model-qa-round1.test.ts`.
