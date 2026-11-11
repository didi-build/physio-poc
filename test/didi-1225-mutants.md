# DIDI-1225 mutants

Baseline commit: `5b6ec59`

Baseline green: `npm run check` — **243** files passed, **2619** passed / **4** skipped (**2623** total).

Full-suite runs (`npm run test`); some kills list incidental browser flakes in the suite summary (investigate by failing test name).

Raw output: `/opt/cursor/artifacts/didi-1225-mutant-runs.txt`

| Mutant | Intent                                       | Killing test(s) (representative)                                                                                             | Suite delta                       |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| M1     | Drop visibility filter (others' drafts leak) | `never returns another practitioner private draft even when it would score highest`                                          | 2 failed / 241 passed / 4 skipped |
| M2     | Drop published-only on candidate list        | `includes another practitioner published community routine when exercises match`, `ignores practitioner_routines copy rows…` | 2 failed / 241 passed / 4 skipped |
| M3     | Off-by-one threshold (`>` vs `>=`)           | `honours threshold edges…`, `at default threshold 0.5…`, `caps results at maxResults…`                                       | 1 failed / 242 passed / 4 skipped |
| M4     | Drop condition bonus term                    | `adds the documented condition bonus to the score`                                                                           | 1 failed / 242 passed / 4 skipped |
| M5     | Wrong Jaccard (`intersection / len(a)`)      | `honours threshold edges…`, `at default threshold 0.5…`                                                                      | 3 failed / 240 passed / 4 skipped |
| M6     | Endpoint writes on success                   | `performs no writes across tables` (+ other similar HTTP cases that hit the write)                                           | 1 failed / 242 passed / 4 skipped |
| M7     | Skip auth on similar handler                 | `handleRoutinesRequest rejects null session before scoring`                                                                  | 1 failed / 242 passed / 4 skipped |
| M8     | Draft load skips visibility                  | `draft_routine_id loads own draft, excludes self, and returns code-only errors`                                              | 1 failed / 242 passed / 4 skipped |
| M9     | Drop exercise id list cap                    | `returns code-only invalid_input for non-string array elements and oversize lists`                                           | 1 failed / 242 passed / 4 skipped |
| M10    | Drop maxResults slice                        | `caps results at maxResults with stable ordering`                                                                            | 2 failed / 241 passed / 4 skipped |
| M11    | Reverse score sort                           | `caps results at maxResults with stable ordering`                                                                            | 1 failed / 242 passed / 4 skipped |
| M12    | AI flag never throws                         | `returns ai_similarity_not_implemented with no fetch when AI flag is on`                                                     | 1 failed / 242 passed / 4 skipped |
| M13    | Drop unit-interval upper bound (≤1)          | `resolveRoutineSimilarityConfig` threshold/bonus fallbacks; node + worker resolver fallbacks                                 | 1 failed / 242 passed / 4 skipped |
| M14    | Drop unit-interval lower bound (≥0)          | `resolveRoutineSimilarityConfig` negative threshold/bonus fallbacks; worker resolver fallback                                | 1 failed / 242 passed / 4 skipped |
| M15    | Drop max-results range / integer checks      | `resolveRoutineSimilarityConfig` max-results fallbacks; node + worker resolver fallbacks                                     | 1 failed / 242 passed / 4 skipped |
