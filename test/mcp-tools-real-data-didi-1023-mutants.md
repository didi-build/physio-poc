# DIDI-1023 MCP routines QA mutants

Each mutant was applied alone, then the full `npm test` suite ran with `GIT_CONFIG_*` unset. Tracked sources were restored before the next row. Baseline on this branch: **222** files passed, **2283** passed, **4** skipped.

| Id       | Mutant                                                                                                               | Killing test(s)                                                                                                                                         | Result |
| -------- | -------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| M1023-1a | `routines-library-service.ts` `searchOwnerPublishedRoutinesForMcp`: drop `createdBy` on published search/count       | `mcp-tools-real-data-didi-1023.test.ts` owner-only search and cross-owner search isolation                                                              | Killed |
| M1023-1b | `routines-library-service.ts` `searchOwnerPublishedRoutinesForMcp`: append author drafts to MCP results              | `mcp-tools-real-data-didi-1023.test.ts` > search_routines returns only owner published routines and excludes drafts and other owners                    | Killed |
| M1023-1c | `physio-mcp-tool-service.ts` `getProgramBuilderLink`: call `createProgramFromRoutine` on `from_routine_id` success   | `mcp-tools-real-data-didi-1023.test.ts` table-snapshot test, deep-link test, and `mcp-server-http.test.ts` seeded from-routine builder paths            | Killed |
| M1023-1d | `physio-mcp-tool-service.ts` `getProgramBuilderLink`: `builder_link` targets `routineDetail` instead of `programNew` | `mcp-tools-real-data-didi-1023.test.ts` > get_program_builder_link from_routine_id returns exact program-new deep link; related HTTP builder assertions | Killed |

## M1023-1a full-suite tail (verbatim)

```
 Test Files  1 failed | 221 passed (222)
      Tests  2 failed | 2281 passed | 4 skipped (2287)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines returns only owner published routines and excludes drafts and other owners
AssertionError: expected [ { …(5) }, { …(5) } ] to have a length of 1 but got 2
```

## M1023-1b full-suite tail (verbatim)

```
 Test Files  1 failed | 221 passed (222)
      Tests  1 failed | 2282 passed | 4 skipped (2287)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines returns only owner published routines and excludes drafts and other owners
AssertionError: expected [ { …(5) }, { …(5) } ] to have a length of 1 but got 2
```

## M1023-1c full-suite tail (verbatim)

```
 Test Files  2 failed | 220 passed (222)
      Tests  4 failed | 2279 passed | 4 skipped (2287)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > search_routines and get_program_builder_link leave all routine/program tables unchanged
AssertionError: expected true not to be true // Object.is equality
```

## M1023-1d full-suite tail (verbatim)

```
 Test Files  2 failed | 220 passed (222)
      Tests  3 failed | 2280 passed | 4 skipped (2287)
```

```
 FAIL  test/mcp-tools-real-data-didi-1023.test.ts > MCP tools with real data (DIDI-1023) > get_program_builder_link from_routine_id returns exact program-new deep link
AssertionError: expected 'https://app.example.com/routines/0000…' to be 'https://app.example.com/programs/new?…' // Object.is equality
```

**Totals:** 4 mutants run against the full suite, **4 killed**, **0 equivalent**, **0 survived**.
