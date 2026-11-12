# DIDI-1170 mutants (stale_write → HTTP 409)

Baseline (commit `1b22991`), full suite `npm run test`. Browser project failures (72) are missing Chromium on this VM — environment noise.

```
Test Files  10 failed | 234 passed (244)
     Tests  72 failed | 2560 passed | 4 skipped (2636)
```

Raw output: [`artifacts/didi-1170-mutant-runs.txt`](../artifacts/didi-1170-mutant-runs.txt).

Reproduce: `./scripts/run-didi-1170-mutants.sh`

| ID | Mutation | Status | Non-browser `FAIL` count | Killing `FAIL` count | Suite summary |
| -- | -------- | ------ | ------------------------ | -------------------- | ------------- |
| M1 | Remove `stale_write` branch in `mapRoutineProgramCreateError` | Killed | 2 | 2 | 12 failed | 232 passed (244) / 74 failed | 2558 passed | 4 skipped (2636) |
| M2 | Program-builder route: `stale_write` never maps to 409 | Killed | 1 | 1 | 11 failed | 233 passed (244) / 73 failed | 2559 passed | 4 skipped (2636) |
| M3a | Authoring route: `stale_write` maps to 400 | Killed | 5 | 4 | 12 failed | 232 passed (244) / 77 failed | 2555 passed | 4 skipped (2636) |
| M3b | Library route: `stale_write` maps to 400 | Killed | 6 | 4 | 12 failed | 232 passed (244) / 78 failed | 2554 passed | 4 skipped (2636) |
| M4a | Drop authoring `mapRepoError` stale_write branch | Killed | 4 | 4 | 11 failed | 233 passed (244) / 76 failed | 2556 passed | 4 skipped (2636) |
| M4b | Drop library `mapRoutineRepositoryError` stale_write branch | Killed | 9 | 4 | 13 failed | 231 passed (244) / 81 failed | 2551 passed | 4 skipped (2636) |
| M5 | publishDraft batch guards `minRowsAffected` → 999 | Killed | 212 | 2 | 35 failed | 209 passed (244) / 286 failed | 2346 passed | 4 skipped (2636) |
| M6 | savePublishedVersion routine guard `minRowsAffected` → 999 | Killed | 50 | 2 | 23 failed | 221 passed (244) / 122 failed | 2510 passed | 4 skipped (2636) |
| M7 | saveFrozenCopy insert guard `minRowsAffected` → 999 | SURVIVED | 64 | 0 | 27 failed | 217 passed (244) / 138 failed | 2494 passed | 4 skipped (2636) |
| M8 | replaceSavedCopy guard `minRowsAffected` → 999 | SURVIVED | 3 | 0 | 13 failed | 231 passed (244) / 75 failed | 2557 passed | 4 skipped (2636) |
| M9 | `routine_not_found` maps to HTTP 409 (authoring) | Killed | 7 | 4 | 12 failed | 232 passed (244) / 79 failed | 2553 passed | 4 skipped (2636) |

## Killing test names per mutant

### M1

Suite: 12 failed | 232 passed (244) / 74 failed | 2558 passed | 4 skipped (2636)

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 program from routine HTTP stale_write > maps service stale_write to HTTP 409 on POST /api/me/programs/from-routine`
- `test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1170) > maps repository stale_write to stale_write, not invalid_input`

### M2

Suite: 11 failed | 233 passed (244) / 73 failed | 2559 passed | 4 skipped (2636)

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 program from routine HTTP stale_write > maps service stale_write to HTTP 409 on POST /api/me/programs/from-routine`

### M3a

Suite: 12 failed | 232 passed (244) / 77 failed | 2555 passed | 4 skipped (2636)

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`

### M3b

Suite: 12 failed | 232 passed (244) / 78 failed | 2554 passed | 4 skipped (2636)

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > adopt_community_version: real batch guard failure returns 409 stale_write without adopting`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > adopt_community_version: real batch guard failure returns 409 stale_write without adopting`

### M4a

Suite: 11 failed | 233 passed (244) / 76 failed | 2556 passed | 4 skipped (2636)

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`

### M4b

Suite: 13 failed | 231 passed (244) / 81 failed | 2551 passed | 4 skipped (2636)

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > adopt_community_version: real batch guard failure returns 409 stale_write without adopting`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > adopt_community_version: real batch guard failure returns 409 stale_write without adopting`

### M5

Suite: 35 failed | 209 passed (244) / 286 failed | 2346 passed | 4 skipped (2636)

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`

### M6

Suite: 23 failed | 221 passed (244) / 122 failed | 2510 passed | 4 skipped (2636)

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`

### M7

Suite: 27 failed | 217 passed (244) / 138 failed | 2494 passed | 4 skipped (2636)

- _(SURVIVED)_

### M8

Suite: 13 failed | 231 passed (244) / 75 failed | 2557 passed | 4 skipped (2636)

- _(SURVIVED)_

### M9

Suite: 12 failed | 232 passed (244) / 79 failed | 2553 passed | 4 skipped (2636)

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > foreign author draft publish matches read response; only stale write is 409`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > foreign author draft publish matches read response; only stale write is 409`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > missing routine publish matches read response; only stale write is 409`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > missing routine publish matches read response; only stale write is 409`
