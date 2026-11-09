# DIDI-1016 MCP real-data QA R1 mutants (PR #104)

Each mutant was applied alone, then the full `npm test` suite ran with `GIT_CONFIG_*` unset. Tracked sources were restored with `git checkout HEAD --` before the next row. Branch head at mutant runs: `69ea860` (mutants verified on test tree immediately before this commit). Baseline: **220** files passed, **2265** passed, **4** skipped.

| Id       | Mutant                                                                                                                                | Killing test(s)                                                                                                                                                                                | Result     |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| M1016-1a | `physio-mcp-tool-service.ts`: use `connector.share_link` without `open_share_link` guard                                              | (full suite green)                                                                                                                                                                             | Equivalent |
| M1016-1b | `program-publish-service.ts` `getShareConnectorView`: build share URL whenever `openLink` exists; set `open_share_link` from row only | `mcp-tools-real-data.test.ts` > get_program_share_link_or_pdf over HTTP returns no live share_link or pdf_url for expired, closed, boundary, and superseded links                              | Killed     |
| M1016-2  | `program-builder-service.ts` `assertProgramAccess`: drop `created_by` ownership check                                                 | `mcp-tools-real-data.test.ts` > cross-owner get_program_builder_link matches missing-code not-found and does not leak owner data; plus existing program-builder cross-practitioner guard tests | Killed     |

## M1016-1b full-suite tail (verbatim)

```
 Test Files  1 failed | 219 passed (220)
      Tests  1 failed | 2264 passed | 4 skipped (2269)
```

```
 FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > get_program_share_link_or_pdf over HTTP returns no live share_link or pdf_url for expired, closed, boundary, and superseded links
```

## M1016-2 full-suite tail (verbatim)

```
 Test Files  4 failed | 216 passed (220)
      Tests  19 failed | 2246 passed | 4 skipped (2269)
```

```
 FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > cross-owner get_program_builder_link matches missing-code not-found and does not leak owner data
```

**Totals:** 3 mutants run against the full suite, **2 killed**, **1 equivalent**, **0 survived**.
