# Program from routine HTTP mutants (DIDI-1133)

Each mutant was run against the full `npm test` suite (same as `npm run check` test step). Temp dirs used `TMPDIR=/tmp/didi-1133-tmp`.

| Mutant                                                                                              | Killing test                                                                                                       | Result |
| --------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ | ------ |
| `handleProgramBuilderRequest` skips `requirePractitioner` for `from-routine`                        | `returns 401 without a session for every route in the program builder route table`                                 | Killed |
| `from-routine` skips `rejectBodyPractitionerId`                                                     | `rejects practitionerId and practitioner_id at top level, nested, and in arrays on every mutating JSON body route` | Killed |
| `parseFromRoutineBody` hard-codes `source` to `community`                                           | `my_copy from B does not read A saved practitioner copy rows` (when B has a saved copy with different hold_s)      | Killed |
| `parseFromRoutineBody` hard-codes `source` to `my_copy`                                             | `returns 201 with program view on POST /api/me/programs/from-routine` (community fixture)                          | Killed |
| `createProgramFromRoutine` HTTP handler sets `published_at` after create                            | `does not publish or create a share link after create from routine`                                                | Killed |
| `getRoutineSentProgramStats` HTTP handler counts B published programs for A                         | `returns sent_count and codes only for the caller published programs`                                              | Killed |
| Foreign draft routine returns a different JSON body than a missing routine id                       | `returns identical program_not_found for missing, foreign, and draft-only routines`                                | Killed |
| Remove `POST /api/me/programs/from-routine` from `programBuilderHttpRouteCases`                     | `returns 401 without a session for every route in the program builder route table`                                 | Killed |
| Remove CSRF-protected sample for `from-routine` from mutating route registry (drop POST from table) | `MUTATING_APP_API_ROUTE_SAMPLES` CSRF coverage via `mutating-app-api-csrf.test.ts`                                 | Killed |
| Remove `/api/me/routines/` dispatch line from `app.ts`                                              | `serves GET sent-programs through the Worker entry with session` (authed GET becomes 404 not_found)                | Killed |
| `parseFromRoutineBody` accepts unknown keys                                                         | `rejects invalid from-routine bodies with canonical invalid_input`                                                 | Killed |
| Remove row count / shape validation in `parseFromRoutineBody` only (service still validates)        | `rejects invalid from-routine bodies with canonical invalid_input` (`row_ids: []`)                                 | Killed |
