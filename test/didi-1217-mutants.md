# DIDI-1217 mutants (migration 0009, conditions adapters, routine_conditions)

Baseline (branch `cursor/didi-1217-routine-conditions-2d7c`, commit before mutants): full suite `npm run test`:

```
 Test Files  238 passed (238)
      Tests  2386 passed | 4 skipped (2390)
```

Each mutant was applied alone, the full suite was run, then the touched file was restored with `git checkout -- <file>` before the next row.

| ID  | Mutation                                                                                       | Status | Failed | Passed | Skipped | Total | Primary killer(s)                                                                                                   |
| --- | ---------------------------------------------------------------------------------------------- | ------ | ------ | ------ | ------- | ----- | ------------------------------------------------------------------------------------------------------------------- |
| M1  | `0009_routine_conditions.sql`: comment out backfill `INSERT OR IGNORE`                         | Killed | 1      | 2385   | 4       | 2390  | `didi-1217-routine-conditions.test.ts` backfills at apply time when routines already have condition_id              |
| M2  | `0009_routine_conditions.sql`: duplicate backfill with plain `INSERT` after `INSERT OR IGNORE` | Killed | 2      | 2384   | 4       | 2390  | `didi-1217-routine-conditions.test.ts` apply-time backfill; `routines-direct-entry.browser.test.ts` (browser flake) |
| M3  | `0009_routine_conditions.sql`: remove `idx_conditions_label_normalized` unique index           | Killed | 2      | 2384   | 4       | 2390  | `didi-1217-routine-conditions.test.ts` normalized label duplicate insert/rename                                     |
| M4  | `routines.ts`: `ConditionsRepository` uses `label` instead of `normalizeConditionLabelKey`     | Killed | 3      | 2383   | 4       | 2390  | `didi-1217-routine-conditions.test.ts` label dedupe; `routine-data-model.test.ts` insert expectation                |
| M5  | `0009_routine_conditions.sql`: drop `PRIMARY KEY (routine_id, condition_id)`                   | Killed | 3      | 2383   | 4       | 2390  | `didi-1217-routine-conditions.test.ts` duplicate pair and idempotent backfill                                       |
| M6  | `0009_routine_conditions.sql`: drop `REFERENCES conditions` on `condition_id`                  | Killed | 4      | 2382   | 4       | 2390  | `didi-1217-routine-conditions.test.ts` FK enforcement; `exercise-data-model-qa-round3.test.ts` FK count             |
