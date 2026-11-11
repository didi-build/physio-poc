# DIDI-1024 mutants (routine authoring UI)

Clean baseline (full suite, no mutant):

```
 Test Files  239 passed (239)
      Tests  2381 passed | 4 skipped (2385)
```

UI seam: `test/ui/routines-authoring-didi-1024.test.tsx` (9 tests).

| ID  | Mutant                                                                                  | UI seam (`routines-authoring-didi-1024`)                       | Full suite                                                                                        | Reverted |
| --- | --------------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| M1  | `RoutineDraftEditorPage`: skip `cancelUntouchedRoutineDraft` on untouched Cancel        | `Test Files  1 failed (1)` / `Tests  1 failed \| 8 passed (9)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2380 passed \| 4 skipped (2385)` | yes      |
| M2  | `RoutineDetailsPage`: remove `onUndo` from discard-draft toast                          | `Test Files  1 failed (1)` / `Tests  1 failed \| 8 passed (9)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2380 passed \| 4 skipped (2385)` | yes      |
| M3  | `RoutineDraftEditorPage`: do not set `validationIssues` on publish validation error     | `Test Files  1 failed (1)` / `Tests  1 failed \| 8 passed (9)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2380 passed \| 4 skipped (2385)` | yes      |
| M4  | `RoutineEditForEveryonePage`: send `expected_published_version: liveVersion - 1`        | `Test Files  1 failed (1)` / `Tests  1 failed \| 8 passed (9)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2380 passed \| 4 skipped (2385)` | yes      |
| M5  | `RoutinePublishSheet`: use raw `bodyRegionLabel` instead of `capitalizeBodyRegionLabel` | `Test Files  1 failed (1)` / `Tests  1 failed \| 8 passed (9)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2380 passed \| 4 skipped (2385)` | yes      |

All mutants reverted; `git diff` clean before commit.
