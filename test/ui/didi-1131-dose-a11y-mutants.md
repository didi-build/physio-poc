# My defaults dose accessible names mutants (DIDI-1131, QA R1)

Generated from actual `npm test` runs on branch `cursor/didi-1131-dose-accessible-names-9c09` (each mutant applied alone, then full suite). Baseline after scoped label ids: `195` files passed, `2107` passed, `4` skipped.

| ID  | Mutant                                                                | Result | Full suite summary                     | Pin signal                                                                     |
| --- | --------------------------------------------------------------------- | ------ | -------------------------------------- | ------------------------------------------------------------------------------ |
| M1  | Revert to global `md-dose-a11y-*` ids (drop `typeTitleId` prefix)     | Killed | `2` failed, `2101` passed, `4` skipped | `my-defaults-page.test.tsx` concurrent editors; `type-default-editor.test.tsx` |
| M2  | `hold_s` accessible name `Hold` instead of `Hold in seconds`          | Killed | `2` failed, `2101` passed, `4` skipped | `type-default-editor.test.tsx` after edit; `my-defaults-page.test.tsx` save    |
| M3  | Prefix dose `aria-labelledby` with type title id plus scoped label id | Killed | `2` failed, `2101` passed, `4` skipped | Same six dose name / uniqueness assertions as M1                               |

Totals: 3 mutants run against the full suite, **3 killed**, **0 survived**, **0 equivalent**.
