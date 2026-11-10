# DIDI-1021 mutants (routine authoring API)

Baseline (branch `cursor/didi-1021-routine-authoring-fc33`, head before mutant runs): **236** test files, **2353** passed, **4** skipped (`npm test`).

Each mutant was applied alone, full suite run, then `git checkout HEAD --` on the touched file(s).

| ID  | Mutation                                                                                                             | Status | Failed | Passed | Skipped | Total | Primary killer(s)                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------- | ------ | ------ | ------ | ------- | ----- | ---------------------------------------------------------------------------- |
| M1  | `routine-authoring-service.ts`: `publishValidationIssues` forced to `[]` (no publish gate)                           | Killed | 1      | 2352   | 4       | 2357  | `routines-authoring-http.test.ts` publish_validation_failed                  |
| M2  | `routine-authoring-service.ts`: after `saveCommunityVersion`, `UPDATE program_rows` via `programs.source_routine_id` | Killed | 4      | 2349   | 4       | 2357  | `routines-authoring-http.test.ts` edit isolation                             |
| M3  | `routines.ts`: `DELETE FROM routine_versions` before save (restore deletes history)                                  | Killed | 215    | 2138   | 4       | 2357  | `routine-data-model.test.ts`, `routines-authoring-http.test.ts`, batch tests |
| M4  | `routines.ts` `findVisibleToPractitioner`: draft visible to non-authors                                              | Killed | 4      | 2349   | 4       | 2357  | `routines-authoring-http.test.ts` author-only draft                          |
| M5  | `physio-mcp-tools.golden.json`: rename `search_routines` → `create_routine`                                          | Killed | 8      | 2345   | 4       | 2357  | MCP golden / connector tests, `routines-authoring-http.test.ts`              |
