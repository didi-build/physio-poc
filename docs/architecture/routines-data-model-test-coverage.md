# Routines data model test coverage (DIDI-1017)

QA mutation and guard coverage notes for `src/storage/repositories/routines.ts`, routine validators in `src/domain/exercise-free-text.ts`, program origin updates in `src/storage/repositories/programs.ts`, and migration `0005_routine_data_model.sql`.

## Known gaps (not fixed in this PR)

- **Partial `createDraft` writes:** If the `routines` insert succeeds and the `routine_versions` insert fails (for example duplicate `draftVersionId`), the database can hold a routine row with no draft version. That orphan cannot be published, edited, or retried with the same ids (`publishDraft` and `replaceDraftRow` return `Draft version not found`). Atomic multi-statement writes for `createDraft` (alongside publish, save version, and save copy) are tracked in **DIDI-1098**; the transactional port work is **DIDI-1101**. Tests live in `test/routine-data-model-qa-round2.test.ts`.

## Unreachable post-insert re-reads (mutation survivors by design)

These branches re-load a row that the statement immediately before wrote with the same primary key. They remain uncovered by meaningful behaviour tests:

- `routines.ts:242` after `createDraft` insert
- `routines.ts:379` after `publishDraft` update
- `routines.ts:460` after `savePublishedVersion` insert path
- `routines.ts:656` after `saveFrozenCopy` insert

## Formerly claimed unreachable (now tested)

- **`routines.ts:358` and `:548`:** `publishDraft` and `replaceDraftRow` when no draft version exists. Reachable after a partial `createDraft` write; covered by `test/routine-data-model-qa-round2.test.ts`.

## Mutation targets killed by tests (representative)

| Location                                                               | Killing test                                                                                                                                     |
| ---------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `hasCommunityUpdateFlag` (`routines.ts:669`, `>` vs `>=`)              | `test/routine-data-model.test.ts` practitioner frozen copies test (false at same version, false when `published_version` is null, true after v2) |
| `listDraftsForAuthor` (`routines.ts:178`, `published_version IS NULL`) | `test/routine-data-model.test.ts` keeps draft routines visible only to the author                                                                |
| `validateConditionLabel` trim (`exercise-free-text.ts:168`)            | `test/routine-data-model-guard-coverage.test.ts` stores a padded condition label trimmed                                                         |
| `setRoutineOrigin` soft-delete guard (`programs.ts:284`)               | `test/routine-data-model-qa-round2.test.ts` missing and soft-deleted program cases                                                               |
| Version pinning and opaque id guards                                   | `test/routine-data-model-guard-coverage.test.ts`, `test/routine-data-model-qa-round1.test.ts`, schema constraint tests                           |

See also guard tables in `test/routine-data-model-guard-coverage.test.ts` and QA round 1 notes in `test/routine-data-model-qa-round1.test.ts`.
