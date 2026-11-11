# DIDI-1024 mutants (routine authoring UI)

Clean baseline (full suite, no mutant, post DIDI-1204 merge):

```
 Test Files  239 passed (239)
      Tests  2379 passed | 4 skipped (2383)
```

UI seam: `test/ui/routines-authoring-didi-1024.test.tsx` (7 tests).

| ID  | Mutant                                                                              | UI seam (`routines-authoring-didi-1024`)                       | Full suite                                                                                        | Reverted |
| --- | ----------------------------------------------------------------------------------- | -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| M1  | `RoutineDraftEditorPage`: skip `cancelUntouchedRoutineDraft` on untouched Cancel    | `Test Files  1 failed (1)` / `Tests  1 failed \| 6 passed (7)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2378 passed \| 4 skipped (2383)` | yes      |
| M2  | `RoutineDetailsPage`: remove `onUndo` from discard-draft toast                      | `Test Files  1 failed (1)` / `Tests  1 failed \| 6 passed (7)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2378 passed \| 4 skipped (2383)` | yes      |
| M3  | `RoutineDraftEditorPage`: do not set `validationIssues` on publish validation error | `Test Files  1 failed (1)` / `Tests  1 failed \| 6 passed (7)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2378 passed \| 4 skipped (2383)` | yes      |
| M4  | `RoutineEditForEveryonePage`: send `expected_published_version: liveVersion - 1`    | `Test Files  1 failed (1)` / `Tests  1 failed \| 6 passed (7)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2378 passed \| 4 skipped (2383)` | yes      |

All mutants reverted; `git diff` clean before commit.
