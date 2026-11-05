# Exercise request approve link mutants (DIDI-1137)

Branch head at generation time: set when PR is pushed (see PR body head SHA). Temp dir: `TMPDIR=/tmp/didi-1137-tmp`. Each mutant was applied alone on production sources, then `npm test` (full Vitest suite) ran with `GIT_CONFIG_*` unset. The touched file was reverted with `git checkout HEAD -- <path>` before the next row.

Every mutant in this table was run against the full suite (`npm test`).

## Mutant results

| Id  | Mutant                                                                                                 | Result | Killing test or equivalence                                                                                                                     |
| --- | ------------------------------------------------------------------------------------------------------ | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| L1  | Drop `linkApprovedPlaceholders` in `approveRequest` (`skippedCount = 0`)                               | Killed | `approveRequest links placeholders on soft-deleted programs to the approved version id` (and other DIDI-1137 acceptance tests)                  |
| L2  | Pass latest approved `exercise_versions.id` into link instead of draft v1 id                           | Killed | `approveRequest pins the approved draft version id when a newer approved version exists on the exercise`                                        |
| L3  | Skip linking when `program.deleted_at` is set in `buildLinkApprovedPlaceholderStatements`              | Killed | `approveRequest links placeholders on soft-deleted programs to the approved version id`                                                         |
| L4  | Do not increment `skippedCount` on prescription type mismatch                                          | Killed | `approveRequest returns skipped_count for type-mismatched placeholders and leaves them unlinked`                                                |
| L5  | Add `.linkApprovedPlaceholders(` on `ProgramBuilderService` under `src/http/routes/program-builder.ts` | Killed | `invokes linkApprovedPlaceholders only from the exercise request approve service`; `does not reference linkApprovedPlaceholders under src/http` |

**Totals:** 5 rows exercised, **5 Killed**, **0 Equivalent**, **0 Survived**.
