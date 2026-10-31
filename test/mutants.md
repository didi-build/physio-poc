# DIDI-1146 mutation testing (PR #63)

Each mutant was applied alone, then the full `npm test` suite was run with `GIT_CONFIG_*` unset. Results are actual outcomes only.

| ID                | Mutant                                                              | Killing test(s)                                           | Result                |
| ----------------- | ------------------------------------------------------------------- | --------------------------------------------------------- | --------------------- |
| M1                | Remove raw vs trimmed check in `prepare-wrangler-config.mjs`        | prepare whitespace rejection                              | Killed                |
| M2                | Remove lowercase UUID check in `prepare-wrangler-config.mjs`        | prepare uppercase and shape fixtures                      | Killed                |
| M3                | Remove newline rejection in `prepare-wrangler-config.mjs`           | prepare embedded newline                                  | Killed                |
| M4                | Remove `set -x` guard                                               | Deploy job static leak guards                             | Killed                |
| M5                | Remove `cat wrangler.ci.jsonc` guard (also covers Q13)              | cat and migrations step fixtures                          | Killed                |
| M6                | Remove print-derived-d1-id guard (also covers Q3b and Q3c)          | echo/printf TRIMMED fixtures                              | Killed                |
| M7                | Remove upload-artifact guard (also covers Q12)                      | upload-artifact fixtures                                  | Killed                |
| M8                | Remove ACTIONS_STEP_DEBUG guard                                     | ACTIONS_STEP_DEBUG fixture                                | Killed                |
| M9                | Stop excluding deploy workflow from glob scan                       | workflow glob fixture                                     | Killed                |
| Q3a               | Echo rejected id in script stderr                                   | prepare no-echo tests                                     | Killed                |
| B1-2              | Weaken deploy job main guard with `\|\| true`                       | exact main-branch guard test                              | Killed                |
| B1-6              | Skip unpinned `uses:` scan in `verify-action-pins.mjs`              | verify-action-pins tag ref test                           | Killed                |
| B6-name-first     | Only match id-first `- uses:` lines in parser                       | verify-action-pins name-first test                        | Killed                |
| B6-job-level      | (covered by job-level @v4 fixture in verify-action-pins)            | verify-action-pins job-level test                         | Killed                |
| B6-flow           | (covered by flow mapping short SHA fixture)                         | verify-action-pins flow mapping test                      | Killed                |
| B6-scan-all-steps | Make deploy leak loop a no-op                                       | Deploy job scans every step fixtures                      | Killed                |
| B6-last-step      | Omit last deploy step from leak scan                                | last step leak fixture                                    | Killed                |
| B2-bash-uuid      | Remove bash lowercase UUID grep before add-mask                     | Prepare deploy step bash validation                       | Killed                |
| L2                | Allow uppercase hex in `LOWERCASE_CANONICAL_UUID_RE`                | prepare uppercase and shape fixtures                      | Killed                |
| L3a               | Drop `.yaml` from workflow glob                                     | extra-leak.yaml fixture                                   | Killed                |
| L3b               | Drop `d1 migrations apply` from scan predicate                      | d1 migrations apply marker test                           | Killed                |
| L4                | Add `continue-on-error: true` on Prepare step                       | continue-on-error test                                    | Killed                |
| L5                | Break exact Prepare run script constant                             | exact Prepare run script test                             | Killed                |
| L6                | Skip persist dir cleanup after local D1 test                        | existsSync after D1 adapter test                          | Killed                |
| L-head            | Remove head wrangler.ci.jsonc guard                                 | head leak fixture                                         | Killed                |
| L-grep            | Remove grep wrangler.ci.jsonc guard                                 | grep leak fixture                                         | Killed                |
| L-summary         | Remove GITHUB_STEP_SUMMARY guard                                    | summary leak fixture                                      | Killed                |
| L-placeholder     | Remove committed placeholder check in script                        | placeholder unit and bash tests                           | Killed                |
| L7                | Revert programs-page autosave test to waitFor without timer advance | auto-saves program name test (non-deterministic debounce) | Killed                |
| Q15               | Extra secret on deploy job                                          | (scope)                                                   | Deferred to DIDI-1154 |

Totals: 30 mutants run, 29 killed, 0 survived, 1 deferred (Q15).

Docker `./` allowlist and digest pinning are covered by verify-action-pins tests (no separate mutation row; removing those branches fails the dedicated tests, same as B1-6).

Per [CTO ruling 21a863d2](https://linear.app/didi-build/issue/DIDI-1146#comment-21a863d2). Items 1, 3 and 5 remain in DIDI-1154.
