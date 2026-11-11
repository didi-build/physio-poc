# DIDI-1217 mutants (migration 0009, conditions adapters, routine_conditions)

Baseline (branch `cursor/didi-1217-routine-conditions-2d7c`, commit `5ddfac7` before mutant reruns): full suite `npm run test`:

```
 Test Files  238 passed (238)
      Tests  2392 passed | 4 skipped (2396)
```

Each mutant was applied alone, the full suite was run, then the touched file was restored with `git checkout -- <file>` before the next row.

| ID             | Mutation                                                                                        | Status | Failed | Passed | Skipped | Total | Primary killer(s)                                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- | ------ | ------ | ------ | ------- | ----- | ---------------------------------------------------------------------------------------------------------------------- |
| M1             | `0009_routine_conditions.sql`: comment out routine_conditions backfill `INSERT OR IGNORE`       | Killed | 2      | 2390   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` apply-time and migration-file backfill idempotency                              |
| M2a            | `0009_routine_conditions.sql`: backfill plain `INSERT` (no `OR IGNORE`)                         | Killed | 4      | 2388   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` migration-file backfill idempotency (`didi-1217` killers); see flake note below |
| M2             | `0009_routine_conditions.sql`: duplicate plain `INSERT` after `INSERT OR IGNORE`                | Killed | 2      | 2390   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` apply-time backfill; AC(1) unchanged snapshot                                   |
| M3             | `0009_routine_conditions.sql`: remove `idx_conditions_label_normalized`                         | Killed | 3      | 2389   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` collision + repository dedupe                                                   |
| M4             | `routines.ts`: `ConditionsRepository` uses `label` instead of `normalizeConditionLabelKey`      | Killed | 3      | 2389   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` dedupe; `routine-data-model.test.ts` insert expectation                         |
| M5             | `0009_routine_conditions.sql`: drop `PRIMARY KEY`, add non-unique `idx_routine_conditions_pair` | Killed | 5      | 2387   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` duplicate-pair row count; D1 schema compare                                     |
| M6             | `0009_routine_conditions.sql`: drop `REFERENCES conditions` on `condition_id`                   | Killed | 6      | 2386   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` FK + behavioural delete RESTRICT; FK count QA                                   |
| M7-no-lower    | `0009_routine_conditions.sql`: `lower(trim(` → `trim(` in label backfill UPDATE                 | Killed | 876    | 1516   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` canonical UPDATE + pre-0009 backfill (migration apply / openMigratedDatabase)   |
| M8-no-collapse | `0009_routine_conditions.sql`: `lower(trim(chars))` only, no collapse `replace` passes          | Killed | 3      | 2389   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` canonical UPDATE; pre-0009 label collision                                      |
| M9-CASCADE     | `0009_routine_conditions.sql`: `ON DELETE CASCADE` on `condition_id`                            | Killed | 4      | 2388   | 4       | 2396  | `didi-1217-routine-conditions.test.ts` behavioural delete RESTRICT + DDL; FK count QA                                  |

**M2a flake note:** raw output also listed `routines-direct-entry.browser.test.ts` (3 tests) in the same run; treated as unrelated browser flake, not counted toward the M2a kill rationale.

### Applied diffs (representative hunks)

**M1** — backfill commented out (`migrations/0009_routine_conditions.sql`).

**M2a** — `INSERT OR IGNORE` → `INSERT` on routine_conditions backfill.

**M2** — second duplicate `INSERT INTO routine_conditions …` appended after the `INSERT OR IGNORE` block.

**M3** — removed `CREATE UNIQUE INDEX … idx_conditions_label_normalized`.

**M4** — `const normalized = label` in `ConditionsRepository.insert` / `updateLabel`.

**M5** — removed `PRIMARY KEY (routine_id, condition_id)`; added `CREATE INDEX IF NOT EXISTS idx_routine_conditions_pair ON routine_conditions (routine_id, condition_id)`.

**M6** — `condition_id TEXT NOT NULL` without `REFERENCES conditions`.

**M7-no-lower** — removed `lower(` wrapper on migration label backfill expression.

**M8-no-collapse** — `SET label_normalized = lower(trim(replace(...chars...)))` with no repeated space-collapse replaces.

**M9-CASCADE** — `ON DELETE CASCADE` on `condition_id` FK.
