# DIDI-1170 mutants (stale_write → HTTP 409)

Baseline commit `cfb424f`, green suite via `npm run test` (Chromium installed).

```
exit_code: 0
 Test Files  244 passed (244)
      Tests  2632 passed | 4 skipped (2636)
```

Raw output (not in repo): `/opt/cursor/artifacts/didi-1170-mutant-runs.txt`

Reproduce: `./scripts/run-didi-1170-mutants.sh`

| ID  | Status | Test Files                   | Tests                                       | `revert_git_diff_quiet` |
| --- | ------ | ---------------------------- | ------------------------------------------- | ----------------------- |
| M1  | Killed | 2 failed \| 242 passed (244) | 2 failed \| 2630 passed \| 4 skipped (2636) | yes                     |
| M2  | Killed | 1 failed \| 243 passed (244) | 1 failed \| 2631 passed \| 4 skipped (2636) | yes                     |
| M3a | Killed | 2 failed \| 242 passed (244) | 5 failed \| 2627 passed \| 4 skipped (2636) | yes                     |
| M3b | Killed | 2 failed \| 242 passed (244) | 6 failed \| 2626 passed \| 4 skipped (2636) | yes                     |
| M4a | Killed | 2 failed \| 242 passed (244) | 7 failed \| 2625 passed \| 4 skipped (2636) | yes                     |
| M4b | Killed | 3 failed \| 241 passed (244) | 9 failed \| 2623 passed \| 4 skipped (2636) | yes                     |
| M5  | Killed | 3 failed \| 241 passed (244) | 7 failed \| 2625 passed \| 4 skipped (2636) | yes                     |
| M6  | Killed | 2 failed \| 242 passed (244) | 5 failed \| 2627 passed \| 4 skipped (2636) | yes                     |
| M7  | Killed | 3 failed \| 241 passed (244) | 6 failed \| 2626 passed \| 4 skipped (2636) | yes                     |
| M8  | Killed | 1 failed \| 243 passed (244) | 2 failed \| 2630 passed \| 4 skipped (2636) | yes                     |
| M9  | Killed | 2 failed \| 242 passed (244) | 7 failed \| 2625 passed \| 4 skipped (2636) | yes                     |

## Per mutant

### M1 — remove `stale_write` branch in `mapRoutineProgramCreateError`

`revert_git_diff_quiet: yes`

```diff
-      if (err.code === "stale_write") {
-        throw new ProgramBuilderServiceError("Stale write", "stale_write");
-      }
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 program from routine HTTP stale_write > maps service stale_write to HTTP 409 on POST /api/me/programs/from-routine`
- `test/program-builder-service-from-routine.test.ts > ProgramBuilderService program from routine (DIDI-1170) > maps repository stale_write to stale_write, not invalid_input`

### M2 — program-builder route: `stale_write` never maps to 409

`revert_git_diff_quiet: yes`

```diff
-      error.code === "stale_write"
+      error.code === "stale_write_never"
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 program from routine HTTP stale_write > maps service stale_write to HTTP 409 on POST /api/me/programs/from-routine`

### M3a — authoring route: `stale_write` maps to 400

`revert_git_diff_quiet: yes`

```diff
-        ? 409
+        ? 400
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`
- `test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > returns 409 stale_write on save_community_version when expected_published_version is stale`

### M3b — library route: `stale_write` maps to 400

`revert_git_diff_quiet: yes`

```diff
-        ? 409
+        ? 400
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > adopt_community_version: competing community version before replace batch returns 409 stale_write without partial rows`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > adopt_community_version: competing community version before replace batch returns 409 stale_write without partial rows`
- `test/routines-library-http.test.ts > Routines library HTTP (session routes) > maps stale_write to HTTP 409 on DELETE remove`
- `test/routines-library-http.test.ts > Routines library HTTP (session routes) > maps stale_write to HTTP 409 on undo with had_copy false`

### M4a — drop authoring `mapRepoError` `stale_write` branch

`revert_git_diff_quiet: yes`

```diff
-    if (err.code === "stale_write") {
-      throw new RoutineAuthoringServiceError("Stale write", "stale_write");
-    }
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`
- `test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-detail-update direct entry at 390 and 1280 px`
- `test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-my-copy-direct direct entry at 390 and 1280 px`
- `test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-detail-load-failed direct entry at 390 and 1280 px`

### M4b — drop library `mapRoutineRepositoryError` `stale_write` branch

`revert_git_diff_quiet: yes`

```diff
-    if (err.code === "stale_write") {
-      throw new RoutinesLibraryServiceError("Stale write", "stale_write");
-    }
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > adopt_community_version: competing community version before replace batch returns 409 stale_write without partial rows`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > adopt_community_version: competing community version before replace batch returns 409 stale_write without partial rows`
- `test/routines-library-http.test.ts > Routines library HTTP (session routes) > maps stale_write to HTTP 409 on DELETE remove`
- `test/routines-library-http.test.ts > Routines library HTTP (session routes) > maps stale_write to HTTP 409 on undo with had_copy false`
- `test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > removeFromMyRoutines maps deleteCopy stale_write to a typed service error`
- `test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > applyUndo with had_copy false maps deleteCopy stale_write`
- `test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > maps repository stale_write to a typed service error on my copy adopt`

### M5 — `publishDraft` batch: remove `minRowsAffected` guards

`revert_git_diff_quiet: yes`

```diff
-        minRowsAffected: 1,
       },
       {
         sql: `UPDATE routines SET published_version = ?, draft_updated_at = ?
        WHERE id = ? AND published_version IS NULL AND created_by = ?`,
         bindings: [1, input.publishedAt, routineId, authorId],
-        minRowsAffected: 1,
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > publish: concurrent HTTP publishes return one 200 and one 409 stale_write without partial publish`
- `test/routine-batch-didi-1098-atomicity.test.ts > publishDraft stale_write guards (BetterSqliteStorage) > concurrent publishDraft calls leave one winner and stale_write on the loser`
- `test/routine-batch-didi-1098-atomicity.test.ts > publishDraft stale_write guards (D1SqlStorage fake) > concurrent publishDraft calls leave one winner and stale_write on the loser`
- `test/routine-batch-didi-1098-atomicity.test.ts > batch statement guard contracts (builder) > publishDraft statements require minRows and publish guards in SQL`
- `test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-my-copy-direct direct entry at 390 and 1280 px`
- `test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-detail-load-failed direct entry at 390 and 1280 px`

### M6 — `savePublishedVersion`: remove routine `published_version` guard `minRowsAffected`

`revert_git_diff_quiet: yes`

```diff
-        minRowsAffected: 1,
       },
       {
         sql: `INSERT INTO routine_versions (
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > save_community_version: competing version save before batch returns 409 stale_write with no extra published row`
- `test/routine-batch-didi-1098-atomicity.test.ts > savePublishedVersion stale_write guards (BetterSqliteStorage) > concurrent savePublishedVersion leaves one v2 and stale_write with no partial v2 row`
- `test/routine-batch-didi-1098-atomicity.test.ts > savePublishedVersion stale_write guards (D1SqlStorage fake) > concurrent savePublishedVersion leaves one v2 and stale_write with no partial v2 row`
- `test/routine-batch-didi-1098-atomicity.test.ts > batch statement guard contracts (builder) > savePublishedVersion statements require optimistic published_version guard`

### M7 — `saveFrozenCopy`: drop `published_version` pin in INSERT guard

`revert_git_diff_quiet: yes`

```diff
-      WHERE r.id = ? AND r.published_version = ? AND r.created_by = ?`,
+      WHERE r.id = ? AND r.created_by = ?`,
           routineId,
-          input.sourceVersionNumber,
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > POST my-routines save: competing publish bump before saveFrozenCopy batch returns 409 stale_write with no copy row`
- `test/routine-batch-didi-1098-atomicity.test.ts > saveFrozenCopy published source guard (BetterSqliteStorage) > writes nothing and returns stale_write when the source version is no longer the routine published_version`
- `test/routine-batch-didi-1098-atomicity.test.ts > saveFrozenCopy published source guard (D1SqlStorage fake) > writes nothing and returns stale_write when the source version is no longer the routine published_version`
- `test/routine-batch-didi-1098-atomicity.test.ts > batch statement guard contracts (builder) > saveFrozenCopy header insert requires published source guard and minRowsAffected`
- `test/routines-library-service.test.ts > RoutinesLibraryService (integration, SQLite) > maps repository stale_write to a typed service error on my copy adopt`

### M8 — `replaceSavedCopy`: remove `routines` `published_version` batch guard

`revert_git_diff_quiet: yes`

```diff
-      {
-        sql: `UPDATE routines SET draft_updated_at = draft_updated_at
-              WHERE id = ? AND published_version = ?`,
-        bindings: [routineId, input.sourceVersionNumber],
-        minRowsAffected: 1,
-      },
       {
         sql: `DELETE FROM practitioner_routine_rows WHERE practitioner_routine_id = ?`,
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > adopt_community_version: competing community version before replace batch returns 409 stale_write without partial rows`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > adopt_community_version: competing community version before replace batch returns 409 stale_write without partial rows`

### M9 — `routine_not_found` maps to HTTP 409 (authoring)

`revert_git_diff_quiet: yes`

```diff
-        : error.code === "practitioner_not_found" || error.code === "routine_not_found"
+        : error.code === "practitioner_not_found"
           ? 404
+          : error.code === "routine_not_found"
+            ? 409
```

Failing tests:

- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > foreign author draft publish matches read response; only stale write is 409`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > foreign author draft publish matches read response; only stale write is 409`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (BetterSqliteStorage) > missing routine publish matches read response; only stale write is 409`
- `test/didi-1170-routines-stale-write-http.test.ts > DIDI-1170 stale_write HTTP races (D1SqlStorage fake) > missing routine publish matches read response; only stale write is 409`
- `test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > hides empty author drafts from non-author publish validation`
- `test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > returns 404 routine_not_found for non-authors on every draft mutation`
- `test/routines-authoring-http.test.ts > Routine authoring HTTP (DIDI-1021) > rejects undo on a never-existing routine id with GET-identical 404 and no create`
