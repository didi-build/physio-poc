# Routines tab blank fix mutants (DIDI-1174)

Branch head at generation: `f9c840ab6fb6ebbec83129809c74fbd65c7f109c`. Each mutant was applied alone, then the full `npm test` suite ran with cloud-agent `GIT_CONFIG_*` env vars unset. Tracked files were restored with `git checkout HEAD --` before the next row.

Log: `/tmp/didi-1174-mutants.log`

| Id      | Mutant                                                                                 | Result |
| ------- | -------------------------------------------------------------------------------------- | ------ |
| M1174-1 | Remove `routines: <RoutinesPage />` from `src/ui/App.tsx`                              | Killed |
| M1174-2 | Force `showEmpty` to `false` in `RoutinesPageContent`                                  | Killed |
| M1174-3 | Remove empty branch; always render an empty list element                               | Killed |
| M1174-4 | Swap My routines vs All routines empty headings                                        | Killed |
| M1174-5 | Remove `data-testid="routines-page"`                                                   | Killed |
| M1174-6 | Point Routines nav tab link at `PHYSIO_APP_ROUTE_PATTERNS.exercises` in `ShellNav.tsx` | Killed |

**Totals:** 6 mutants run against the full suite, **6 killed**, **0 survived**, **0 equivalent**.
