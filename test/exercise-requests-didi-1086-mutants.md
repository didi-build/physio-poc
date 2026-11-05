# Exercise requests mutants (DIDI-1086 / PR #72)

Branch head at generation: `ec8ea10dd982a748c5c75decd6ad8bfccf804b92`. Temp dir: `TMPDIR=/tmp/didi-1086-tmp`. Each mutant was applied alone, the full `npm test` suite ran with all `GIT_CONFIG_*` unset (`1876` passed, `4` skipped at baseline), then tracked files were restored with `git checkout -- .` before the next row.

Log: `/tmp/didi-1086-tmp/mutant-log.txt`

## DIDI-1086 scope mutants

| Id      | Mutant                                                                                                                | Result | Killing test(s)                                                                                                                                 |
| ------- | --------------------------------------------------------------------------------------------------------------------- | ------ | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| M1086-1 | Drop merged-note `validateRequestNote` pre-check in `appendMergeToDraftRequest`                                       | Killed | `rejects merge when combined notes exceed the character cap with invalid_input` (raw `FreeTextValidationError` without `invalid_input` mapping) |
| M1086-2 | Allow over-cap merge note write (drop pre-check and skip `validateRequestNote` in `buildUpdateNoteBatchStatement`)    | Killed | same service test (expects `invalid_input` and unchanged stored note)                                                                           |
| M1086-3 | Map merge `FreeTextValidationError` to `draft_not_ready` instead of `invalid_input` in `mapMergedNoteValidationError` | Killed | same service test                                                                                                                               |
| M1086-4 | Submit draft uses sequential `sql.run` per statement instead of one guarded `sql.batch`                               | Killed | `submitRequest creates the request and draft through one sql.batch call` in `exercise-requests-submit-batch.test.ts`                            |
| M1086-5 | Second approve omits `request_already_approved` guard (falls through to `draft_not_ready`)                            | Killed | `rejects a second approve with request_already_approved`; `POST approve twice returns 409 request_already_approved`                             |

**Totals:** 5 mutants run against the full suite, **5 Killed**, **0 Equivalent**, **0 Survived**.

**Note on M1086-2:** A narrower mutant that only skipped `buildUpdateNoteBatchStatement` validation **survived** the full suite because the merge pre-check still rejected over-cap notes. The row above uses the combined mutant that matches "allow over-cap merge write."
