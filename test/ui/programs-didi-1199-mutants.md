# DIDI-1199 from_routine_id deep link mutants

Baseline (clean tree, full `npm run test`): **Test Files 235 passed (235)**; **Tests 2342 passed | 4 skipped (2346)**.

| ID  | Mutant                                                                                              | Killed? | Full suite (files)             | Full suite (tests)                          | Failing test tail                                                                                                                                               |
| --- | --------------------------------------------------------------------------------------------------- | ------- | ------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `ProgramsNewPage.tsx`: restore `createFromPickedRoutine(initialFromRoutine)` in `useEffect` on load | Killed  | 1 failed, **234 passed** (235) | 4 failed, **2338 passed**, 4 skipped (2346) | `programs-didi-1199-from-routine-deep-link-http.test.tsx` — auto-create on load breaks zero-POST, picker preselect, cross-owner read, and tap-only create cases |

## M1 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > does not POST on load or re-render; preselects the routine; POSTs once on tap
TestingLibraryElementError: Unable to find an element with the text: Knee routine for UI.

 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > disables Create program from routine while the POST is in flight
Error: expect(element).toBeEnabled()

 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > shows the error slot for a cross-owner routine id without any write
Error: expect(received).toBeInTheDocument()

 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199, integration HTTP) > shows the error slot when create fails with invalid_input after tap
AssertionError: expected "createProgramFromRoutine" to be called 1 times, but got 2 times
```

**Totals:** 1 mutant run against the full suite, **1 killed**, **0 equivalent**, **0 survived**.

All mutants reverted after measurement.
