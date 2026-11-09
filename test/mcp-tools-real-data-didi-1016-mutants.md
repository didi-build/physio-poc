# DIDI-1016 MCP real-data QA mutants (PR #104)

Each mutant was applied alone, then the full `npm test` suite ran with `GIT_CONFIG_*` unset. Tracked sources were restored with `git checkout HEAD --` before the next row. Baseline after CTO structured-output commit `dc14962`: **221** files passed, **2276** passed, **4** skipped.

| Id       | Mutant                                                                                                                     | Killing test(s)                                                                                                                                                                                                         | Result     |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
| M1016-1a | `physio-mcp-tool-service.ts`: use `connector.share_link` without `open_share_link` guard                                   | (full suite green)                                                                                                                                                                                                      | Equivalent |
| M1016-1b | `program-publish-service.ts` `getShareConnectorView`: build share URL whenever `openLink` exists; ignore `shareLinkStatus` | (full suite green; MCP layer still clears share via `open_share_link` and `share_link_state`)                                                                                                                           | Equivalent |
| M1016-1c | `ShareLinksRepository.findOpenByProgramId`: drop `AND closed_at IS NULL`                                                   | `mcp-tools-real-data.test.ts` > get_program_share_link_or_pdf over HTTP returns no live share_link or pdf_url… (republish open vs superseded token setup); plus program-builder share_link_status pinned-clock coverage | Killed     |
| M1016-2  | `program-builder-service.ts` `assertProgramAccess`: drop `created_by` ownership check                                      | `mcp-tools-real-data.test.ts` > cross-owner get_program_builder_link matches missing-code not-found…; `program-builder-service-from-routine.test.ts`; plus existing program-builder cross-practitioner guard tests      | Killed     |

## M1016-1c full-suite tail (verbatim)

```
 Test Files  4 failed | 217 passed (221)
      Tests  4 failed | 2272 passed | 4 skipped (2280)
```

```
 FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > get_program_share_link_or_pdf over HTTP returns no live share_link or pdf_url for expired, closed, boundary, and superseded links
AssertionError: expected '8_j3UuqNOTnPpi1BovxS8XPGDeg9MhvWQu3Cl…' not to be '8_j3UuqNOTnPpi1BovxS8XPGDeg9MhvWQu3Cl…' // Object.is equality
 ❯ test/mcp-tools-real-data.test.ts:530:36
```

## M1016-2 full-suite tail (verbatim)

```
 Test Files  5 failed | 216 passed (221)
      Tests  19 failed | 2257 passed | 4 skipped (2280)
```

```
 FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > cross-owner get_program_builder_link matches missing-code not-found and does not leak owner data
AssertionError: expected undefined to be true // Object.is equality
 ❯ test/mcp-tools-real-data.test.ts:660:31
```

**Totals:** 4 mutants run against the full suite, **2 killed**, **2 equivalent**, **0 survived**.
