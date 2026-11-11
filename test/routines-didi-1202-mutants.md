# Saved copy undo/PATCH approved-row mutants (DIDI-1202)

Generated from actual `npm test` runs on branch `cursor/didi-1202-saved-copy-validation-a96a` (each mutant applied alone, full suite, then restore from good copy). Baseline: **236** test files, **2364** passed, **4** skipped.

| ID  | Mutation                                                                                            | Status | Failed | Passed | Skipped | Total | Primary killer(s)                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------- | ------ | ------ | ------ | ------- | ----- | ------------------------------------------------------------------------------------------------------------------------ |
| M1  | `routines-library-service.ts` `applyUndo`: drop `validateApprovedRows` before restore               | Killed | 2      | 2362   | 4       | 2368  | `routines-library-http.test.ts` tampered undo (draft version, mismatched exercise_id)                                    |
| M2  | `routines-library-service.ts` `updateMyCopy`: drop `validateApprovedRows` before replace            | Killed | 1      | 2363   | 4       | 2368  | `routines-library-http.test.ts` PATCH with unapproved version                                                            |
| M3  | `validate-approved-rows.ts` `findUnapprovedRoutineRow`: accept any approved version (skip id match) | Killed | 4      | 2360   | 4       | 2368  | `routines-library-http.test.ts` all three guards; `routines-authoring-http.test.ts` tampered undo mismatched exercise_id |

**Totals:** 3 mutants run against the full suite, **3 killed**, **0 survived**, **0 equivalent**.

All mutants reverted after measurement (`git diff` clean on touched production files).
