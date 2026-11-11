# DIDI-1024 mutants (routine authoring UI)

Clean baseline (full suite, no mutant):

```
 Test Files  239 passed (239)
      Tests  2387 passed | 4 skipped (2391)
```

UI seam: `test/ui/routines-authoring-didi-1024.test.tsx` (15 tests).

| ID  | Mutant                                                                                  | UI seam (`routines-authoring-didi-1024`)                         | Full suite                                                                                        | Reverted |
| --- | --------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| M1  | `RoutineDraftEditorPage`: skip `cancelUntouchedRoutineDraft` on untouched Cancel        | `Test Files  1 failed (1)` / `Tests  1 failed \| 14 passed (15)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2386 passed \| 4 skipped (2391)` | yes      |
| M2  | `RoutineDetailsPage`: remove `onUndo` from discard-draft toast                          | `Test Files  1 failed (1)` / `Tests  1 failed \| 14 passed (15)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2386 passed \| 4 skipped (2391)` | yes      |
| M3  | `RoutineDraftEditorPage`: do not set `validationIssues` on publish validation error     | `Test Files  1 failed (1)` / `Tests  1 failed \| 14 passed (15)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2386 passed \| 4 skipped (2391)` | yes      |
| M4  | `RoutineEditForEveryonePage`: send `expected_published_version: liveVersion - 1`        | `Test Files  1 failed (1)` / `Tests  1 failed \| 14 passed (15)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2386 passed \| 4 skipped (2391)` | yes      |
| M5  | `RoutinePublishSheet`: use raw `bodyRegionLabel` instead of `capitalizeBodyRegionLabel` | `Test Files  1 failed (1)` / `Tests  1 failed \| 14 passed (15)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2386 passed \| 4 skipped (2391)` | yes      |
| M6  | `RoutineDraftEditorPage`: body-region pills `{option.label}` not sentence case          | `Test Files  1 failed (1)` / `Tests  3 failed \| 12 passed (15)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  3 failed \| 2384 passed \| 4 skipped (2391)` | yes      |
| M7  | `RoutineNewPage`: mount-effect `createRoutineDraft` on load (regression)                | `Test Files  1 failed (1)` / `Tests  3 failed \| 12 passed (15)` | `Test Files  2 failed \| 237 passed (239)` / `Tests  5 failed \| 2382 passed \| 4 skipped (2391)` | yes      |
| M8  | `RoutineDraftEditorPage`: navigate on create before post-create autosave                | `Test Files  1 failed (1)` / `Tests  1 failed \| 14 passed (15)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2386 passed \| 4 skipped (2391)` | yes      |

All mutants reverted; `git diff` clean in `src/` before commit.
