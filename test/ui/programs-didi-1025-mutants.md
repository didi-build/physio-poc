# DIDI-1025 from-routine QA mutants (PR #97)

Baseline (clean tree, full `npm run test`): **Test Files 234 passed (234)**; **Tests 2336 passed | 4 skipped (2340)**.

| ID  | Mutant                                                                              | Killed? | Full suite (files)             | Full suite (tests)                          | Failing test tail                                                                                                                              |
| --- | ----------------------------------------------------------------------------------- | ------- | ------------------------------ | ------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| M1  | `program-from-routine.ts`: `resolveRoutineProgramSource` always returns `community` | Killed  | 2 failed, **232 passed** (234) | 3 failed, **2333 passed**, 4 skipped (2340) | `programs-didi-1025-from-routine-http.test.tsx` — Use for a patient / Create program POST `source` is `my_copy` when My copy segment is active |

## M1 full-suite tail (verbatim)

```
 FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > Use for a patient posts source my_copy when My copy segment is active
AssertionError: expected 'community' to be 'my_copy' // Object.is equality

Expected: "my_copy"
Received: "community"

 FAIL  test/ui/programs-didi-1025-from-routine-http.test.tsx > Program from routine UI (DIDI-1025, integration HTTP) > Create program posts source my_copy when the version segment is on My copy
AssertionError: expected 'community' to be 'my_copy' // Object.is equality

Expected: "my_copy"
Received: "community"
```

(One unrelated flaky layout capture in the same run: `programs-persistent-controls-layout.browser.test.ts`.)

**Totals:** 1 mutant run against the full suite, **1 killed**, **0 equivalent**, **0 survived**.

All mutants reverted after measurement.
