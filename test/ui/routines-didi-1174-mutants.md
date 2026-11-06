# Routines tab blank fix mutants (DIDI-1174)

Branch head at generation: `84c5227` (full SHA in PR How verified section). Each mutant was applied alone, then the full `npm test` suite ran with cloud-agent `GIT_CONFIG_*` env vars unset. Tracked files were restored before the next row.

Log: `/tmp/didi-1174-mutants.log`

| Id      | Mutant                                                    | Result |
| ------- | --------------------------------------------------------- | ------ |
| M1174-1 | Remove `routines: <RoutinesPage />` from `src/ui/App.tsx` | Killed |
| M1174-2 | Force `showEmpty` to `false` in `RoutinesPageContent`     | Killed |
| M1174-3 | Remove empty branch; always render an empty list element  | Killed |
| M1174-4 | Swap My routines vs All routines empty headings           | Killed |
| M1174-5 | Remove `data-testid="routines-page"`                      | Killed |

**Totals:** 5 mutants run against the full suite, **5 killed**, **0 survived**, **0 equivalent**.
