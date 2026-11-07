# Library shared spacing mutants (DIDI-1180)

Generated from actual `npm test` runs on branch `cursor/didi-1180-library-spacing-aad6` (each mutant applied alone, layout harness rebuilt with `npx vite build --config vite.layout-harness.config.ts`, then full suite). Baseline with fix: `2076` passed, `2` failed (pre-existing `exercise-requests-layout.browser.test.ts` at `390` px), `4` skipped.

| ID  | Mutant                                      | Result | Full suite summary                     | Layout pin signal                                         |
| --- | ------------------------------------------- | ------ | -------------------------------------- | --------------------------------------------------------- |
| M1  | Restore nested `ex-page` horizontal padding | Killed | `5` failed, `2073` passed, `4` skipped | `library-spacing-layout.browser.test.ts` gutter alignment |
| M2  | Remove `.pg-page.ex-page { padding: 0 }`    | Killed | `3` failed, `2075` passed, `4` skipped | `library-spacing-layout.browser.test.ts` Routines gutter  |
| M3  | Remove `.ex-tabs` `mt-3` title-to-tabs gap  | Killed | `5` failed, `2073` passed, `4` skipped | `library-spacing-layout.browser.test.ts` title-to-tabs    |
| M4  | Add nested horizontal padding on `.ex-tabs` | Killed | `3` failed, `2075` passed, `4` skipped | `library-spacing-layout.browser.test.ts` gutter alignment |
| M5  | Move Routines helper back inside tab panel  | Killed | `3` failed, `2075` passed, `4` skipped | `library-spacing-layout.browser.test.ts` gutter alignment |

Totals: 5 mutants run against the full suite, **5 killed**, **0 survived**, **0 equivalent**.
