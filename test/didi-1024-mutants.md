# DIDI-1024 mutants (routine authoring UI)

Clean baseline (full suite, no mutant, commit `5bb33ba`):

```
 Test Files  239 passed (239)
      Tests  2390 passed | 4 skipped (2394)
```

UI seam: `test/ui/routines-authoring-didi-1024.test.tsx` (18 tests).

| ID   | Mutant                                                                                            | UI seam (`routines-authoring-didi-1024`)                         | Full suite                                                                                        | Reverted |
| ---- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | -------- |
| M1   | `RoutineDraftEditorPage`: skip `cancelUntouchedRoutineDraft` on untouched Cancel                  | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  2 failed \| 237 passed (239)` / `Tests  4 failed \| 2386 passed \| 4 skipped (2394)` | yes      |
| M2   | `RoutineDetailsPage`: remove `onUndo` from discard-draft toast                                    | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M3   | `RoutineDraftEditorPage`: do not set `validationIssues` on publish validation error               | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M4   | `RoutineEditForEveryonePage`: send `expected_published_version: liveVersion - 1`                  | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M5   | `RoutinePublishSheet`: use raw `bodyRegionLabel` instead of `capitalizeBodyRegionLabel`           | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M6   | `RoutineDraftEditorPage`: body-region pills `{option.label}` not sentence case                    | `Test Files  1 failed (1)` / `Tests  3 failed \| 15 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  3 failed \| 2387 passed \| 4 skipped (2394)` | yes      |
| M7   | `RoutineDraftEditorPage`: mount-effect `createRoutineDraft` on load (regression)                  | `Test Files  1 failed (1)` / `Tests  4 failed \| 14 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  4 failed \| 2386 passed \| 4 skipped (2394)` | yes      |
| M8a  | `RoutineDraftEditorPage`: navigate on `createRoutineDraft` before post-create autosave (**weak**) | `Test Files  1 passed (1)` / `Tests  18 passed (18)`             | `Test Files  1 failed \| 238 passed (239)` / `Tests  2 failed \| 2388 passed \| 4 skipped (2394)` | yes      |
| M8b  | M8a plus skip post-create `autosaveRoutineDraft` in `onBodyRegionSelect` (**strong**)             | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M9   | `RoutineEditForEveryonePage`: restore legacy banner (no history link, programs note in paragraph) | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M10  | `RoutineDraftEditorPage`: always `NEW_ROUTINE` heading (ignore fresh vs `EDIT_DRAFT`)             | `Test Files  1 failed (1)` / `Tests  2 failed \| 16 passed (18)` | `Test Files  2 failed \| 237 passed (239)` / `Tests  4 failed \| 2386 passed \| 4 skipped (2394)` | yes      |
| M11  | `EDIT_FOR_EVERYONE_BANNER_AFTER_HISTORY` wording regression (`could` not `can`)                   | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  2 failed \| 237 passed (239)` / `Tests  6 failed \| 2384 passed \| 4 skipped (2394)` | yes      |
| M12  | `editForEveryoneBannerBeforeHistory`: `remains in` not `stays in`                                 | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M13  | `EDIT_FOR_EVERYONE_PROGRAMS_NOTE` text regression                                                 | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M14a | `EDIT_FOR_EVERYONE_BANNER_HISTORY_LINK` not `history`                                             | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M14b | History link `to` uses `routines` not `routineVersionHistory`                                     | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |
| M15  | `draftHeading` uses empty name only (ignores exercise rows)                                       | `Test Files  1 failed (1)` / `Tests  1 failed \| 17 passed (18)` | `Test Files  1 failed \| 238 passed (239)` / `Tests  1 failed \| 2389 passed \| 4 skipped (2394)` | yes      |

**M8a:** UI seam survived (`18 passed`); full suite reports `2 failed | 2388 passed`.

All mutants reverted; `git diff` clean in `src/` before commit.
