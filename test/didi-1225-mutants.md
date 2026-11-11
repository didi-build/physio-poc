# DIDI-1225 mutants

Baseline commit: `b95c351`.

Baseline green: `npm run test` — **242** files passed, **2584** passed / **4** skipped (**2588** total).

Raw output: `/opt/cursor/artifacts/didi-1225-mutant-runs.txt`

| Mutant | Intent                                       | Killing test(s) (from full-suite run)                                                                                        | Suite delta                        |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ---------------------------------- |
| M1     | Drop visibility filter (others' drafts leak) | `never returns another practitioner private draft even when it would score highest`                                          | 1 failed / 2583 passed / 4 skipped |
| M2     | Drop published-only filter                   | `includes another practitioner published community routine when exercises match`                                             | 1 failed / 2583 passed / 4 skipped |
| M3     | Off-by-one threshold (`>` vs `>=`)           | `honours threshold edges and a non-default threshold`                                                                        | 1 failed / 2583 passed / 4 skipped |
| M4     | Drop condition bonus term                    | `adds the documented condition bonus to the score`                                                                           | 5 failed / 2579 passed / 4 skipped |
| M5     | Wrong Jaccard (`intersection / len(a)`)      | `honours threshold edges and a non-default threshold`                                                                        | 2 failed / 2582 passed / 4 skipped |
| M6     | Endpoint writes on success                   | `performs no writes across tables` (also `matches identical…`, `honours threshold…`, `adds the documented condition bonus…`) | 4 failed / 2580 passed / 4 skipped |
| M7     | Skip auth on similar handler                 | `handleRoutinesRequest rejects null session before scoring`                                                                  | 1 failed / 2583 passed / 4 skipped |
