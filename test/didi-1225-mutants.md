# DIDI-1225 mutants

Baseline commit: `70fc63a`

Baseline green: `npm run check` — **242** files passed, **2591** passed / **4** skipped (**2595** total).

Mutant runs target `test/didi-1225-routine-similar-http.test.ts` only (no full-suite Playwright noise).

Raw output: `/opt/cursor/artifacts/didi-1225-mutant-runs.txt`

| Mutant | Intent                                       | Killing test(s)                                                                                                              | Target-file suite delta   |
| ------ | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| M1     | Drop visibility filter (others' drafts leak) | `never returns another practitioner private draft even when it would score highest`                                           | 1 failed / 16 passed (17) |
| M2     | Drop published-only on candidate list        | `includes another practitioner published community routine when exercises match`, `ignores practitioner_routines copy rows…` | 2 failed / 15 passed (17) |
| M3     | Off-by-one threshold (`>` vs `>=`)           | `honours threshold edges…`, `at default threshold 0.5 shows score 0.5…`                                                   | 2 failed / 15 passed (17) |
| M4     | Drop condition bonus term                    | `adds the documented condition bonus to the score`                                                                           | 1 failed / 16 passed (17) |
| M5     | Wrong Jaccard (`intersection / len(a)`)      | `honours threshold edges…`, `at default threshold 0.5…`                                                                      | 2 failed / 15 passed (17) |
| M6     | Endpoint writes on success                   | `performs no writes across tables` (+ several happy-path cases that hit the write)                                            | 8 failed / 9 passed (17)  |
| M7     | Skip auth on similar handler                 | `handleRoutinesRequest rejects null session before scoring`                                                                  | 1 failed / 16 passed (17) |
| M8     | Draft load skips visibility                  | `draft_routine_id loads own draft, excludes self, and returns code-only errors`                                              | 1 failed / 16 passed (17) |
| M9     | Drop exercise id list cap                    | `returns code-only invalid_input for non-string array elements and oversize lists`                                           | 1 failed / 16 passed (17) |
| M10    | Drop maxResults slice                        | `caps results at maxResults with stable ordering`                                                                            | 1 failed / 16 passed (17) |
| M11    | Reverse score sort                           | `caps results at maxResults with stable ordering`                                                                            | 1 failed / 16 passed (17) |
| M12    | AI flag never throws                         | `returns ai_similarity_not_implemented with no fetch when AI flag is on`                                                      | 1 failed / 16 passed (17) |
