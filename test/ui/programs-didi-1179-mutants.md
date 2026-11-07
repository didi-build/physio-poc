# DIDI-1179 mutation table (Programs persistent list controls)

Generated from actual `npm test` runs on branch `cursor/programs-persistent-controls-57e2` (each mutant applied alone to `src/ui/programs/ProgramsListPage.tsx`, then full suite, then `cp /tmp/pg-good.tsx` restore). Baseline after the fix: `197` files passed, `2115` passed, `4` skipped.

| ID  | Mutant                                                     | Result     | Full suite summary                       | Layout / pin signal                                                    |
| --- | ---------------------------------------------------------- | ---------- | ---------------------------------------- | ---------------------------------------------------------------------- |
| M1  | Restore `showEmpty` guard hiding search and origin filters | Killed     | `2` failed, `2106` passed, `4` skipped   | `programs-didi-1179.test.tsx`, `programs-page.test.tsx` empty copy     |
| M2  | Hide controls while `loading`                              | Killed     | `2` failed, `2110` passed, `4` skipped   | `programs-didi-1179.test.tsx` loading controls cases                   |
| M3  | Never render zero-program empty block (`false ?`)          | Killed     | `3` failed, `2105` passed, `4` skipped   | `programs-didi-1179.test.tsx`, `programs-page.test.tsx`                |
| M4  | `showEmpty` without `!loading` (empty during fetch)        | Killed     | `2` failed, `2113` passed, `4` skipped   | `programs-didi-1179.test.tsx` does not show empty while loading        |
| M5  | `useEffect` clears search query when `showEmpty`           | Equivalent | `197` passed, `2115` passed, `4` skipped | `showEmpty` requires `trimmedQuery.length === 0`, so no reachable case |
| M6  | Remove `data-testid="programs-list-controls"`              | Killed     | `2` failed, `2108` passed, `4` skipped   | `programs-persistent-controls-layout.browser.test.ts`                  |

**Totals:** 5 mutants run against the full suite, **5 killed**, **0 survived**, **1 equivalent**.
