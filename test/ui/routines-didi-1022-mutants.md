# Routines library UI mutants (DIDI-1022)

Generated from actual `npm test` runs on branch `cursor/didi-1022-routines-ui-1dc0` (each mutant applied alone; layout mutants rebuilt with `npm run build:layout-harness`, then full suite). Baseline: `193` files, `2110` passed, `4` skipped.

| ID  | Mutant                                                                   | Result | Full suite summary                     | Pin signal                                                 |
| --- | ------------------------------------------------------------------------ | ------ | -------------------------------------- | ---------------------------------------------------------- |
| M1  | Hide condition section in filters panel (`false && conditionsAvailable`) | Killed | `1` failed, `2109` passed, `4` skipped | `routines-library.test.tsx` condition filter               |
| M2  | Routines phone search `margin-top: 0` (revert `0.5rem`)                  | Killed | `1` failed, `2109` passed, `4` skipped | `library-spacing-layout.browser.test.ts` routines-all @390 |
| M3  | Flag banner threshold `flaggedCount > 99`                                | Killed | `1` failed, `2109` passed, `4` skipped | `routines-library.test.tsx` flagged banner                 |
| M4  | Adopt success toast text `"wrong"`                                       | Killed | `1` failed, `2109` passed, `4` skipped | `routines-library.test.tsx` adopt and keep                 |
| M5  | Remove success toast text `"wrong"`                                      | Killed | `1` failed, `2109` passed, `4` skipped | `routines-library.test.tsx` remove from detail             |
| M6  | Keep-mine toast text `"wrong"`                                           | Killed | `1` failed, `2109` passed, `4` skipped | `routines-library.test.tsx` adopt and keep                 |
| M7  | Empty state `data-testid` renamed                                        | Killed | `5` failed, `2105` passed, `4` skipped | `routines-library.test.tsx`, `routines-didi-1174.test.tsx` |

Totals: 7 mutants run against the full suite, **7 killed**, **0 survived**, **0 equivalent**.
