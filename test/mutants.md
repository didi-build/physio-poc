# DIDI-1146 mutation testing (PR #63)

Each mutant was applied locally, then the full `npm test` suite was run with `GIT_CONFIG_*` unset unless noted.

| ID   | Mutant                                                       | Killing test                                                         | Result                |
| ---- | ------------------------------------------------------------ | -------------------------------------------------------------------- | --------------------- |
| M1   | Remove raw vs trimmed check in `prepare-wrangler-config.mjs` | `prepare-wrangler-config.test.ts` whitespace rejection               | Killed                |
| M2   | Remove lowercase UUID check in `prepare-wrangler-config.mjs` | `prepare-wrangler-config.test.ts` uppercase rejection                | Killed                |
| M3   | Remove newline rejection in `prepare-wrangler-config.mjs`    | `prepare-wrangler-config.test.ts` embedded newlines                  | Killed                |
| M4   | Remove `set -x` guard                                        | `rejects set -x in a step run body`                                  | Killed                |
| M5   | Remove `cat wrangler.ci.jsonc` guard                         | `rejects cat of wrangler.ci.jsonc`                                   | Killed                |
| M6   | Remove print-derived-d1-id guard                             | echo/printf fixture tests                                            | Killed                |
| M7   | Remove upload-artifact guard                                 | `rejects upload-artifact in any deploy job step (Q12)`               | Killed                |
| M8   | Remove ACTIONS_STEP_DEBUG guard                              | `rejects ACTIONS_STEP_DEBUG`                                         | Killed                |
| M9   | Stop excluding deploy workflow from glob scan                | `picks up a newly added workflow file`                               | Killed                |
| Q3a  | Echo rejected id in script stderr                            | `rejects a secret that is not UUID-shaped without echoing the value` | Killed                |
| Q3b  | Drop TRIMMED from derived-id print guard                     | `rejects echo of TRIMMED outside add-mask (Q3b)`                     | Killed                |
| Q3c  | Drop TRIMMED from derived-id print guard                     | `rejects printf of TRIMMED outside add-mask (Q3c)`                   | Killed                |
| Q12  | Remove upload-artifact guard                                 | `rejects upload-artifact in any deploy job step (Q12)`               | Killed                |
| Q13  | Remove cat guard                                             | `rejects cat in the migrations step run body (Q13)`                  | Killed                |
| Q15  | Extra secret on deploy job                                   | (deferred)                                                           | Deferred to DIDI-1154 |
| B1-2 | Weaken main guard with `\|\| true` in workflow               | `requires the exact main-branch guard on the deploy job`             | Killed                |
| B1-4 | Script stderr includes rejected secret value                 | prepare-wrangler-config no-echo tests                                | Killed                |
| B1-6 | Skip unpinned `uses:` scan in `verify-action-pins.mjs`       | `verify-action-pins.test.ts` tag ref without token                   | Killed                |
| L1   | Remove newline checks in script and workflow                 | prepare + exact Prepare run script tests                             | Killed                |
| L2   | Accept uppercase UUID (remove lowercase enforcement)         | `rejects uppercase UUID letters`                                     | Killed                |
| L3a  | Drop `.yaml` from workflow glob                              | `extra-leak.yaml` fixture scan                                       | Killed                |
| L3b  | Drop `d1 migrations apply` from scan predicate               | `flags d1 migrations apply without other markers`                    | Killed                |
| L4   | Add `continue-on-error: true` on Prepare step                | `does not set continue-on-error on the Prepare Wrangler config step` | Killed                |
| L5   | Change Prepare run script away from expected constant        | `uses the exact Prepare Wrangler config run script`                  | Killed                |
| L6   | Skip `rmSync` after local D1 test                            | `reads, writes, booleans...` persist dir removed assertion           | Killed                |
| L7   | Reintroduce fixed delay in Safari menu helper                | (none)                                                               | Survived              |

Totals: 25 mutants run, 23 killed, 1 survived (L7), 1 deferred (Q15 to DIDI-1154).

Uppercase UUID policy is enforced in `prepare-wrangler-config.mjs` per [CTO ruling](https://linear.app/didi-build/issue/DIDI-1146#comment-f2d861e0).

Items 1, 3 and 5 from the earlier B1 list and exact deploy-job secret-set guards are deferred to DIDI-1154 per the same ruling.
