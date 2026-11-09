# DIDI-1023 MCP routines QA mutants

Each mutant was applied alone, then the full `npm test` suite ran with `GIT_CONFIG_*` unset. Tracked sources were restored before the next row. Baseline on this branch: **222** files passed, **2284** passed, **4** skipped.

| Id       | Mutant                                                                                                                      | Killing test(s)                                                                                                                               | Result |
| -------- | --------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M1023-1a | `routines-library-service.ts` `searchOwnerPublishedRoutinesForMcp`: drop `createdBy` on published search/count              | `mcp-tools-real-data-didi-1023.test.ts` owner-only search and cross-owner search isolation                                                    | Killed |
| M1023-1b | `routines-library-service.ts` `searchOwnerPublishedRoutinesForMcp`: append author drafts to MCP results                     | `mcp-tools-real-data-didi-1023.test.ts` > search_routines returns only owner published routines and excludes drafts and other owners          | Killed |
| M1023-1c | `physio-mcp-tool-service.ts` `getProgramBuilderLink`: call `createProgramFromRoutine` on `from_routine_id` success          | `mcp-tools-real-data-didi-1023.test.ts` table-snapshot test, `not_supported_v1` test, and `mcp-server-http.test.ts` seeded from-routine paths | Killed |
| M1023-1d | `physio-mcp-tool-service.ts` `getProgramBuilderLink`: success `builder_link` targets `routineDetail` not `not_supported_v1` | `mcp-tools-real-data-didi-1023.test.ts` > get_program_builder_link owner-published from_routine_id returns not_supported_v1 without writes    | Killed |
| M1023-1e | `physio-mcp-tool-service.ts` `getProgramBuilderLink`: restore `summary` `Created program from routine` on success           | `mcp-tools-real-data-didi-1023.test.ts` > get_program_builder_link owner-published from_routine_id returns not_supported_v1 without writes    | Killed |
| M1023-1f | `physio-mcp-tool-service.ts` `getProgramBuilderLink`: `PhysioMcpToolInputError` prose instead of `routine_not_found`        | `mcp-tools-real-data-didi-1023.test.ts` cross-owner from_routine_id; `mcp-server-http.test.ts` unknown routine UUID                           | Killed |
| M1023-1g | `routines-library-service.ts` `findOwnerPublishedRoutineHead`: return synthetic head for owner drafts without publish       | `mcp-tools-real-data-didi-1023.test.ts` > get_program_builder_link treats owner draft-only from_routine_id like a missing id                  | Killed |
| M1023-1h | `physio-mcp-tool-service.ts` `getProgramBuilderLink`: restore `/programs/new?from_routine_id=` deep link on published       | `mcp-tools-real-data-didi-1023.test.ts` > get_program_builder_link owner-published from_routine_id returns not_supported_v1 without writes    | Killed |

## M1023-1a full-suite tail (verbatim)

```
 Test Files  1 failed | 221 passed (222)
      Tests  2 failed | 2282 passed | 4 skipped (2288)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines returns only owner published routines and excludes drafts and other owners
AssertionError: expected [ { …(5) }, { …(5) } ] to have a length of 1 but got 2
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > cross-owner routine search and from_routine_id match missing-id not-found without leak
```

## M1023-1b full-suite tail (verbatim)

```
 Test Files  1 failed | 221 passed (222)
      Tests  1 failed | 2283 passed | 4 skipped (2288)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines returns only owner published routines and excludes drafts and other owners
AssertionError: expected [ { …(5) }, { …(5) } ] to have a length of 1 but got 2
```

## M1023-1c full-suite tail (verbatim)

```
 Test Files  2 failed | 220 passed (222)
      Tests  4 failed | 2280 passed | 4 skipped (2288)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines and get_program_builder_link leave all routine/program tables unchanged
AssertionError: expected 'invalid_input' to be 'not_supported_v1' // Object.is equality
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > get_program_builder_link owner-published from_routine_id returns not_supported_v1 without writes
```

## M1023-1d full-suite tail (verbatim)

```
 Test Files  2 failed | 220 passed (222)
      Tests  4 failed | 2280 passed | 4 skipped (2288)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines and get_program_builder_link leave all routine/program tables unchanged
AssertionError: expected undefined to be true // Object.is equality
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > get_program_builder_link owner-published from_routine_id returns not_supported_v1 without writes
```

## M1023-1e full-suite tail (verbatim)

```
 Test Files  2 failed | 220 passed (222)
      Tests  4 failed | 2280 passed | 4 skipped (2288)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines and get_program_builder_link leave all routine/program tables unchanged
AssertionError: expected undefined to be true // Object.is equality
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > get_program_builder_link owner-published from_routine_id returns not_supported_v1 without writes
```

## M1023-1f full-suite tail (verbatim)

```
 Test Files  3 failed | 219 passed (222)
      Tests  5 failed | 2279 passed | 4 skipped (2288)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > get_program_builder_link treats owner draft-only from_routine_id like a missing id
AssertionError: expected 'Routine not found' to be 'routine_not_found' // Object.is equality
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > cross-owner routine search and from_routine_id match missing-id not-found without leak
```

## M1023-1g full-suite tail (verbatim)

```
 Test Files  2 failed | 220 passed (222)
      Tests  3 failed | 2281 passed | 4 skipped (2288)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > get_program_builder_link treats owner draft-only from_routine_id like a missing id
AssertionError: expected 'this.routines.findDraftForRoutine is …' to be 'routine_not_found' // Object.is equality
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > cross-owner routine search and from_routine_id match missing-id not-found without leak
```

## M1023-1h full-suite tail (verbatim)

```
 Test Files  2 failed | 220 passed (222)
      Tests  4 failed | 2280 passed | 4 skipped (2288)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines and get_program_builder_link leave all routine/program tables unchanged
AssertionError: expected undefined to be true // Object.is equality
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > get_program_builder_link owner-published from_routine_id returns not_supported_v1 without writes
```

**Totals:** 8 mutants run against the full suite, **8 killed**, **0 equivalent**, **0 survived**.
