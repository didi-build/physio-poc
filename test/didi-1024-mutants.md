# DIDI-1024 mutants (routine authoring UI)

Clean baseline (full suite, no mutant):

```
 Test Files  239 passed (239)
      Tests  2389 passed | 4 skipped (2393)
```

UI seam: `test/ui/routines-authoring-didi-1024.test.tsx` (17 tests).

| ID  | Mutant                                                                                            | UI seam (`routines-authoring-didi-1024`)                         | Full suite                                                                                        | Reverted |
| --- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| M1  | `RoutineDraftEditorPage`: skip `cancelUntouchedRoutineDraft` on untouched Cancel                  | `Test Files  1 failed (1)` / `Tests  1 failed \| 16 passed (17)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2388 passed \| 4 skipped (2393)` | yes      |
| M2  | `RoutineDetailsPage`: remove `onUndo` from discard-draft toast                                    | `Test Files  1 failed (1)` / `Tests  1 failed \| 16 passed (17)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2388 passed \| 4 skipped (2393)` | yes      |
| M3  | `RoutineDraftEditorPage`: do not set `validationIssues` on publish validation error               | `Test Files  1 failed (1)` / `Tests  1 failed \| 16 passed (17)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2388 passed \| 4 skipped (2393)` | yes      |
| M4  | `RoutineEditForEveryonePage`: send `expected_published_version: liveVersion - 1`                  | `Test Files  1 failed (1)` / `Tests  1 failed \| 16 passed (17)` | `Test Files  2 failed \| 237 passed (239)` / `Tests  3 failed \| 2386 passed \| 4 skipped (2393)` | yes      |
| M5  | `RoutinePublishSheet`: use raw `bodyRegionLabel` instead of `capitalizeBodyRegionLabel`           | `Test Files  1 failed (1)` / `Tests  1 failed \| 16 passed (17)` | `Test Files  2 failed \| 237 passed (239)` / `Tests  4 failed \| 2385 passed \| 4 skipped (2393)` | yes      |
| M6  | `RoutineDraftEditorPage`: body-region pills `{option.label}` not sentence case                    | `Test Files  1 failed (1)` / `Tests  3 failed \| 14 passed (17)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  3 failed \| 2386 passed \| 4 skipped (2393)` | yes      |
| M7  | `RoutineNewPage`: mount-effect `createRoutineDraft` on load (regression)                          | `Test Files  1 failed (1)` / `Tests  2 failed \| 15 passed (17)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  2 failed \| 2387 passed \| 4 skipped (2393)` | yes      |
| M8a | `RoutineDraftEditorPage`: navigate on `createRoutineDraft` before post-create autosave (**weak**) | `Test Files  1 passed (1)` / `Tests  17 passed (17)`             | `Test Files  239 passed (239)` / `Tests  2389 passed \| 4 skipped (2393)`                         | yes      |
| M8b | M8a plus skip post-create `autosaveRoutineDraft` in `onBodyRegionSelect` (**strong**)             | `Test Files  1 failed (1)` / `Tests  1 failed \| 16 passed (17)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2388 passed \| 4 skipped (2393)` | yes      |
| M9  | `RoutineEditForEveryonePage`: restore legacy banner (no history link, programs note in paragraph) | `Test Files  1 failed (1)` / `Tests  1 failed \| 16 passed (17)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2388 passed \| 4 skipped (2393)` | yes      |
| M10 | `RoutineDraftEditorPage`: always `NEW_ROUTINE` heading (ignore fresh vs `EDIT_DRAFT`)             | `Test Files  1 failed (1)` / `Tests  1 failed \| 16 passed (17)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2388 passed \| 4 skipped (2393)` | yes      |

**M8a:** survived (full suite green). **M8b:** killed by `keeps draft field values when body region is selected last`.

All mutants reverted; `git diff` clean in `src/` before commit.
