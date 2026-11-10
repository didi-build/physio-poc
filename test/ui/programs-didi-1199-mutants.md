# DIDI-1199 from_routine_id deep link mutants

Baseline (clean tree, full `npm run test`): **Test Files 235 passed (235)**; **Tests 2348 passed | 4 skipped (2352)**.

| ID  | Mutant                                                                                                             | Killed? | Full suite (files)             | Full suite (tests)                          | Failing test tail                                                                                                                                         |
| --- | ------------------------------------------------------------------------------------------------------------------ | ------- | ------------------------------ | ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `ProgramsNewPage.tsx`: restore `createFromPickedRoutine(initialFromRoutine)` in `useEffect` on load                | Killed  | 1 failed, **234 passed** (235) | 7 failed, **2340 passed**, 4 skipped (2352) | `programs-didi-1199-from-routine-deep-link-http.test.tsx` deep-link integration cases                                                                     |
| M2  | `ProgramsNewPage.tsx`: reject deep link when `details.community.created_by !== practitionerId`                     | Killed  | 2 failed, **233 passed** (235) | 8 failed, **2339 passed**, 4 skipped (2352) | `programs-didi-1199-from-routine-deep-link-http.test.tsx` > preselects and creates from another author published community routine on tap; layout capture |
| M3  | `ProgramsNewPage.tsx`: pass `busy={false}` to `PickRoutineForProgramSheet`                                         | Killed  | 1 failed, **234 passed** (235) | 1 failed, **2346 passed**, 4 skipped (2352) | `programs-didi-1199-from-routine-deep-link-http.test.tsx` > disables Create program from routine while the POST is in flight                              |
| M4  | `ProgramsNewPage.tsx`: `getRoutineDetails` catch sets `deepLinkRead` to `ok`                                       | Killed  | 1 failed, **234 passed** (235) | 1 failed, **2346 passed**, 4 skipped (2352) | `programs-didi-1199-from-routine-deep-link-http.test.tsx` > disables create when the routine is listed but deep-link getRoutineDetails fails              |
| M5  | `program-from-routine.ts`: `createProgramFromRoutineWithDetails` source always `community`                         | Killed  | 1 failed, **234 passed** (235) | 1 failed, **2346 passed**, 4 skipped (2352) | `programs-didi-1199-from-routine-deep-link-http.test.tsx` > deep link POSTs source my_copy when the practitioner has a saved copy                         |
| M6  | `PickRoutineForProgramSheet.tsx`: omit `createBlocked` from Create `disabled` and remove failed-id selection clear | Killed  | 1 failed, **234 passed** (235) | 1 failed, **2347 passed**, 4 skipped (2352) | `programs-didi-1199-from-routine-deep-link-http.test.tsx` > disables Create when a failed deep-link id stays selected in the picker (jsdom)               |

## M1 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > does not POST on load or re-render; preselects the routine; POSTs once on tap
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > disables Create program from routine while the POST is in flight
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > preselects and creates from another author published community routine on tap
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > deep link POSTs source community when the practitioner has no saved copy
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > deep link POSTs source my_copy when the practitioner has a saved copy
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > preselects a deep-linked routine that is missing from the first search page
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > shows the error slot when create fails with invalid_input after tap
```

## M2 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1025-layout.browser.test.ts > Program from routine layout (DIDI-1025 mockups) > captures from-routine program flows at 390 and 1280 px
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > does not POST on load or re-render; preselects the routine; POSTs once on tap
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > disables Create program from routine while the POST is in flight
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > preselects and creates from another author published community routine on tap
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > deep link POSTs source community when the practitioner has no saved copy
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > deep link POSTs source my_copy when the practitioner has a saved copy
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > preselects a deep-linked routine that is missing from the first search page
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > shows the error slot when create fails with invalid_input after tap
```

## M3 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > disables Create program from routine while the POST is in flight
```

## M4 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > disables create when the routine is listed but deep-link getRoutineDetails fails
Error: expect(element).toBeDisabled()
```

## M5 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > integration HTTP > deep link POSTs source my_copy when the practitioner has a saved copy
AssertionError: expected 'community' to be 'my_copy' // Object.is equality
```

## M6 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1199-from-routine-deep-link-http.test.tsx > Programs /new?from_routine_id deep link (DIDI-1199) > disables Create when a failed deep-link id stays selected in the picker (jsdom)
Error: expect(element).toBeDisabled()
```

**Totals:** 6 mutant runs against the full suite, **6 killed**, **0 equivalent**, **0 survived**.

All mutants reverted after measurement.
