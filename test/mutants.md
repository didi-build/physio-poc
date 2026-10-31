# DIDI-1146 mutation testing (PR #63)

Each mutant was applied alone on production or guard sources (then reverted), then the full `npm test` suite ran with `GIT_CONFIG_*` unset. Results are actual outcomes only. The **Killing test(s)** column names the test that actually fails under that mutant (not a related or historical label). Source-only assertions (for example reading regex `.source`) are not used as killers.

`verify-action-pins` hardening mutants are out of scope on this branch; see DIDI-1163.

| ID                             | Mutant                                                       | Killing test(s)                                     | Result                |
| ------------------------------ | ------------------------------------------------------------ | --------------------------------------------------- | --------------------- |
| M1                             | Remove raw vs trimmed check in `prepare-wrangler-config.mjs` | prepare whitespace rejection                        | Killed                |
| M2                             | Remove lowercase UUID check in `prepare-wrangler-config.mjs` | prepare invalid UUID shape subprocess cases         | Killed                |
| M3                             | Remove newline rejection in `prepare-wrangler-config.mjs`    | prepare embedded newline                            | Killed                |
| M4                             | Remove `set -x` guard                                        | Deploy job static leak guards                       | Killed                |
| M5                             | Remove `cat wrangler.ci.jsonc` guard                         | cat and migrations step fixtures                    | Killed                |
| M6                             | Remove print-derived-d1-id guard                             | echo and printf TRIMMED fixtures                    | Killed                |
| M7                             | Remove upload-artifact guard                                 | upload-artifact fixtures (name-first and bare uses) | Killed                |
| M8                             | Remove ACTIONS_STEP_DEBUG guard                              | ACTIONS_STEP_DEBUG fixture                          | Killed                |
| M9                             | Stop excluding deploy workflow from glob scan                | workflow glob fixture                               | Killed                |
| Q3a                            | Echo rejected id in prepare stderr                           | prepare no-echo tests                               | Killed                |
| B1-2                           | Weaken deploy job main guard with `\|\| true`                | exact main-branch guard test                        | Killed                |
| B6-scan-all-steps              | Make deploy leak loop a no-op                                | Deploy job scans every step fixtures                | Killed                |
| B6-last-step                   | Omit last deploy step from leak scan                         | last step leak fixture                              | Killed                |
| LEAK-skip-uses-steps           | Skip deploy steps whose name starts with `uses `             | bare uses upload-artifact fixture                   | Killed                |
| LEAK-prepare-only              | Scan only Prepare Wrangler steps                             | non-Prepare grep leak fixture                       | Killed                |
| B2-bash-uuid                   | Remove bash UUID grep before add-mask                        | Prepare deploy step bash validation                 | Killed                |
| UUID-JS-upper-groups           | Allow `A-F` in every UUID regex group                        | prepare invalid UUID shape uppercase group cases    | Killed                |
| UUID-JS-optional-hyphens       | Make UUID hyphens optional in JS regex                       | prepare missing hyphens case                        | Killed                |
| UUID-JS-extra-hyphens          | Allow extra `-hhhh` segments before final 12 hex in JS regex | prepare extra hyphen segment case                   | Survived              |
| UUID-JS-braces                 | Allow optional `{` / `}` around UUID in JS regex             | prepare braced junk case                            | Survived              |
| UUID-JS-unanchored             | Drop `^` / `$` anchors on JS UUID regex                      | prepare leading and trailing junk cases             | Killed                |
| UUID-bash-upper-groups         | Allow `A-F` in Prepare grep UUID class                       | bash uppercase second group case                    | Killed                |
| UUID-bash-optional-hyphens     | Make UUID hyphens optional in Prepare grep                   | bash hyphenless case                                | Killed                |
| UUID-bash-extra-hyphens        | Allow extra `-hhhh` segments in Prepare grep                 | bash extra hyphen segment case                      | Survived              |
| UUID-bash-braces               | Allow optional `{` prefix in Prepare grep                    | Prepare bash brace-prefix only case                 | Killed                |
| UUID-bash-unanchored           | Drop `^` / `$` anchors in Prepare grep                       | bash prefixed case                                  | Killed                |
| UUID-bash-locale-af            | Replace `[0123456789abcdef]` with `[0-9a-f]` in Prepare grep | Prepare explicit hex class test                     | Killed                |
| UUID-bash-mask-before-validate | Emit `::add-mask::` before UUID grep                         | Prepare UUID before add-mask order test             | Killed                |
| UUID-bash-echo-on-fail         | Echo `${TRIMMED}` in UUID failure message                    | bash prepare rejection output omits value           | Killed                |
| UUID-bash-newline-leak         | Remove newline `case` before validation                      | bash newline stderr message test                    | Killed                |
| L-head                         | Remove head wrangler.ci.jsonc guard                          | head leak fixture                                   | Killed                |
| L-grep                         | Remove grep wrangler.ci.jsonc guard                          | grep leak fixture                                   | Killed                |
| L-summary                      | Remove GITHUB_STEP_SUMMARY guard                             | summary leak fixture                                | Killed                |
| L-placeholder                  | Remove committed placeholder check in prepare                | placeholder unit and bash tests                     | Killed                |
| L3a                            | Drop `.yaml` from non-deploy workflow glob                   | extra-leak.yaml fixture                             | Killed                |
| L3b                            | Drop `d1 migrations apply` from scan predicate               | d1 migrations apply marker test                     | Killed                |
| L4                             | Add `continue-on-error: true` on Prepare step                | continue-on-error test                              | Killed                |
| L5                             | Remove `pipefail` from Prepare run script                    | Prepare pipefail requirement test                   | Killed                |
| L6                             | Skip rmSync after local D1 adapter test                      | D1 adapter persist cleanup tests                    | Killed                |
| L-bool-d1-roundtrip            | Remove boolean column round trip inserts                     | D1 adapter boolean round trip section               | Survived              |
| L7                             | Disable fake timers in programs-page autosave test           | autosave fake timers active assertion               | Killed                |
| Q15                            | Extra secret on deploy job                                   | (scope)                                             | Deferred to DIDI-1154 |

Totals: 41 mutants run, 37 killed, 4 survived, 1 deferred (Q15).

Per [CTO ruling de77fd55](https://github.com/didi-build/physio-poc/pull/63#issuecomment-6546669280). `verify-action-pins` hardening moved to DIDI-1163. Items 1, 3 and 5 remain in DIDI-1154.
