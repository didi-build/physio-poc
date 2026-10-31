# Programs auto-save and published time mutants (DIDI-1149 / #61)

Each mutant was applied alone at the PR head and run against the full `npm test` suite (1524 tests in CI scope). Results below are from actual runs on this branch unless noted.

## Original #61 table (D1 through Q6b, P2, D8b)

| ID  | Mutant                                                                            | Result   | Killing test(s)                                                                                                                                                                         |
| --- | --------------------------------------------------------------------------------- | -------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Re-add `timeZone: "America/Toronto"` in `formatProgramPublishedAt`                | Killed   | `formatProgramPublishedAt (unit) > formats the fixed instant in the viewer time zone (America/Los_Angeles)`; `Programs auto-save UI` / builder dev-verify with `TZ=America/Los_Angeles` |
| D2  | `AUTO_SAVE_RETRY_INITIAL_MS = 2000`                                               | Killed   | Backoff delay and reset tests                                                                                                                                                           |
| D3  | Remove doubling in retry timer callback                                           | Killed   | `uses exponential auto retry delays of 1.5s doubling up to a 30s cap`                                                                                                                   |
| D4  | No cap on doubling (`retryDelayMsRef.current * 2` only)                           | Killed   | `uses exponential auto retry delays of 1.5s doubling up to a 30s cap`                                                                                                                   |
| D5  | Fixed 1500 ms delay instead of `retryDelayMsRef`                                  | Killed   | Backoff delay and reset tests                                                                                                                                                           |
| D6  | No reset on successful retry                                                      | Killed   | `resets auto retry backoff after a failed save succeeds`                                                                                                                                |
| D7  | No reset in `tryAgain`                                                            | Killed   | `resets auto retry backoff when Try again is pressed`                                                                                                                                   |
| D8  | Remove in-flight skip in retry timer loop                                         | Killed   | `R61c: does not duplicate the latest debounced save when auto retry fires during an in-flight save` only (not the legacy D8 or D08/D09 titles)                                          |
| D8b | Remove deferred-key skip in retry timer loop (in-flight skip kept)                | Survived | none under normal app lifecycle (see precondition below)                                                                                                                                |
| D8c | Do not replace an existing deferred task on in-flight `runSave`                   | Killed   | `D03 exact: newest debounced value wins over deferred task (debounceMs 100)` only (not R61c or D08/D09 titles)                                                                          |
| P2  | Skip `activeRef` guard in `scheduleFailedRetries` / failure `catch` after unmount | Survived | none (timer callback and cleanup guards remain; see QA round 2)                                                                                                                         |
| Q1  | No cap (`MAX = Infinity`)                                                         | Killed   | `uses exponential auto retry delays of 1.5s doubling up to a 30s cap`                                                                                                                   |
| Q2  | Cap at 15 s                                                                       | Killed   | `uses exponential auto retry delays of 1.5s doubling up to a 30s cap`                                                                                                                   |
| Q3  | No reset after success anywhere (`resetRetryBackoff` no-op)                       | Killed   | Backoff reset tests after success and Try again                                                                                                                                         |
| Q3b | No reset in `markSaved`                                                           | Killed   | `resets auto retry backoff after markSaved`                                                                                                                                             |
| Q4  | Published time forced to UTC via `timeZone: "UTC"`                                | Killed   | TZ unit tests and LA-pinned UI tests                                                                                                                                                    |
| Q5a | Fixed locale `en-GB`                                                              | Killed   | TZ unit tests                                                                                                                                                                           |
| Q5b | Fixed locale `fr-FR`                                                              | Killed   | TZ unit tests                                                                                                                                                                           |
| Q6a | Exponent off by one (first retry at 3 s)                                          | Killed   | Exponential delay test; builder dev-verify backoff tests                                                                                                                                |
| Q6b | Exponent off by one at cap (48 s step)                                            | Killed   | `uses exponential auto retry delays of 1.5s doubling up to a 30s cap`                                                                                                                   |

**D8b precondition:** `src/` does not use React `<Activity>` remount semantics. With the shipped lifecycle, a deferred task only exists while its key is in flight; the deferred-only retry skip is redundant with the in-flight skip for probed scenarios. Removing the skip is not a supported product path and is not given a dedicated killing test.

**Round 2 corrected totals (rows D1 through Q6b, P2, D8b):** 18 killed, 2 survived (P2, D8b).

## Round 2 additional mutants

| ID    | Mutant                                              | Result   | Killing test(s)                                                                                                |
| ----- | --------------------------------------------------- | -------- | -------------------------------------------------------------------------------------------------------------- |
| UM1   | Cleanup does not set `activeRef` false              | Killed   | `does not schedule auto retry after unmount when an in-flight save fails`; `does not auto retry after unmount` |
| UMall | All three `activeRef` guards removed                | Killed   | Same unmount auto retry tests                                                                                  |
| UM2   | Cleanup does not clear retry timer                  | Survived | none (equivalent while cleanup clears `activeRef`)                                                             |
| UM3   | No guard at top of `scheduleFailedRetries`          | Survived | none (equivalent with other guards)                                                                            |
| UM4   | No guard in `catch`                                 | Survived | none (equivalent with other guards)                                                                            |
| UM5   | No guard in retry timer callback                    | Survived | none (equivalent with other guards)                                                                            |
| UM6   | No unmount flush of newest unsaved value            | Killed   | `UM6: unmount flushes exactly one save with the newest deferred value`; failed flush / no-op unmount tests     |
| TA1   | No in-flight skip in `tryAgain`                     | Killed   | `N4 and N5: runs exactly one retry when Try again is pressed twice...`                                         |
| TA2   | `tryAgain` does not clear retry timer               | Survived | none (equivalent)                                                                                              |
| NW1   | Debounced edit does not replace failed task         | Killed   | `NW1: debounced edit replaces failed task before auto retry fires`                                             |
| NW2   | In-flight `runSave` does not replace failed task    | Survived | none today (`catch` overwrites; equivalent until retry ordering changes)                                       |
| NW3   | Deferred flush runs failed task instead of deferred | Killed   | `D08 and D09: saves the deferred newer value after an in-flight failure without re-sending stale data`         |
| NW4   | `catch` keeps older failed task                     | Killed   | `NW4: auto retry sends the latest failed reorder task`                                                         |

**#47 mutant table rows corrected in #61:** the prior D8 "equivalent survivor" row and the "7 killed, 1 survived" total were wrong.
