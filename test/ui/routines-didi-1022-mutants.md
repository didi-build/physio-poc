# Routines library UI mutants (DIDI-1022, QA round 1)

Generated from actual `npm test` runs on branch `cursor/didi-1022-routines-ui-1dc0` (each mutant applied alone; layout mutants rebuilt with `npm run build:layout-harness`, then full suite). Baseline: `198` files, `2121` passed, `4` skipped.

| ID  | Mutant                                         | Result | Full suite summary                     | Pin signal                                                 |
| --- | ---------------------------------------------- | ------ | -------------------------------------- | ---------------------------------------------------------- |
| M1  | Hide condition section in filters panel        | Killed | `1` failed, `2120` passed, `4` skipped | `routines-library.test.tsx` condition filter               |
| M2  | Routines phone search `margin-top: 0`          | Killed | `1` failed, `2120` passed, `4` skipped | `library-spacing-layout.browser.test.ts` routines-all @390 |
| M3  | Flag banner threshold `flaggedCount > 99`      | Killed | `1` failed, `2120` passed, `4` skipped | `routines-library.test.tsx` flagged banner                 |
| M4  | Remove `routine-community-changes-held` marker | Killed | `1` failed, `2120` passed, `4` skipped | `routines-library.test.tsx` adopt banner                   |
| M5  | Create program from routine not `disabled`     | Killed | `1` failed, `2120` passed, `4` skipped | `routines-library.test.tsx` adopt banner                   |
| M6  | Personal change positions always `[0]`         | Killed | `1` failed, `2120` passed, `4` skipped | `routines-library-service.test.ts` personal_changes        |
| M7  | Empty state `data-testid` renamed              | Killed | `5` failed, `2116` passed, `4` skipped | `routines-library.test.tsx`, `routines-didi-1174.test.tsx` |

Totals: 7 mutants run against the full suite, **7 killed**, **0 survived**, **0 equivalent**.

Community list bullet content is **not** mutated here; presentation is held pending [DIDI-1183](https://linear.app/didi-build/issue/DIDI-1183).
