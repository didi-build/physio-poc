# DIDI-1199 from_routine_id deep link mutants

Baseline (clean tree, full `npm run test`): **Test Files 235 passed (235)**; **Tests 2344 passed | 4 skipped (2348)**.

| ID  | Mutant                                                                                              | Killed? | Full suite (files)             | Full suite (tests)                          | Failing test tail                                                                                                                                                                          |
| --- | --------------------------------------------------------------------------------------------------- | ------- | ------------------------------ | ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| M1  | `ProgramsNewPage.tsx`: restore `createFromPickedRoutine(initialFromRoutine)` in `useEffect` on load | Killed  | 2 failed, **233 passed** (235) | 7 failed, **2337 passed**, 4 skipped (2348) | `programs-didi-1199-from-routine-deep-link-http.test.tsx` deep-link cases; plus flaky `routines-direct-entry.browser.test.ts` in the same run                                              |
| M2  | `ProgramsNewPage.tsx`: reject deep link when `details.community.created_by !== practitionerId`      | Killed  | 2 failed, **233 passed** (235) | 6 failed, **2338 passed**, 4 skipped (2348) | `programs-didi-1199-from-routine-deep-link-http.test.tsx` > preselects and creates from another author published community routine on tap; layout capture for deep-link preselected picker |

## M1 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > does not POST on load or re-render; preselects the routine; POSTs once on tap
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > disables Create program from routine while the POST is in flight
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > preselects and creates from another author published community routine on tap
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > preselects a deep-linked routine that is missing from the first search page
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > shows the error slot when create fails with invalid_input after tap
 FAIL  test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-my-copy-direct direct entry at 390 and 1280 px
 FAIL  test/ui/routines-direct-entry.browser.test.ts > Routines direct entry (browser, DIDI-1022) > routines-detail-load-failed direct entry at 390 and 1280 px
```

## M2 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1025-layout.browser.test.ts > Program from routine layout (DIDI-1025 mockups) > captures from-routine program flows at 390 and 1280 px
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > does not POST on load or re-render; preselects the routine; POSTs once on tap
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > disables Create program from routine while the POST is in flight
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > preselects and creates from another author published community routine on tap
Error: expect(element).toHaveAttribute("aria-pressed", "true")
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > preselects a deep-linked routine that is missing from the first search page
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > shows the error slot when create fails with invalid_input after tap
```

**Totals:** 2 mutant runs against the full suite, **2 killed**, **0 equivalent**, **0 survived**.

All mutants reverted after measurement.
