# DIDI-1024 mutants (routine authoring UI)

Full suite: `npm run test` (2372 tests). UI seam: `test/ui/routines-authoring-didi-1024.test.tsx` (7 tests).

| ID  | Mutant                                                                              | UI seam (`routines-authoring-didi-1024`) | Full suite                                   | Reverted |
| --- | ----------------------------------------------------------------------------------- | ---------------------------------------- | -------------------------------------------- | -------- |
| M1  | `RoutineDraftEditorPage`: skip `cancelUntouchedRoutineDraft` on untouched Cancel    | 1 failed \| 6 passed (7)                 | 73 failed \| 2295 passed \| 4 skipped (2372) | yes      |
| M2  | `RoutineDetailsPage`: remove `onUndo` from discard-draft toast                      | 1 failed \| 6 passed (7)                 | 73 failed \| 2295 passed \| 4 skipped (2372) | yes      |
| M3  | `RoutineDraftEditorPage`: do not set `validationIssues` on publish validation error | 1 failed \| 6 passed (7)                 | 73 failed \| 2295 passed \| 4 skipped (2372) | yes      |
| M4  | `RoutineEditForEveryonePage`: send `expected_published_version: liveVersion - 1`    | 1 failed \| 6 passed (7)                 | 73 failed \| 2295 passed \| 4 skipped (2372) | yes      |

All mutants reverted; `git diff` clean before commit.
