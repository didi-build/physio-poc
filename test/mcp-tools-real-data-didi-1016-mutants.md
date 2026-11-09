# DIDI-1016 MCP real-data QA mutants (PR #104)

Each mutant was applied alone, then the full `npm test` suite ran with `GIT_CONFIG_*` unset. Tracked sources were restored with `git checkout HEAD --` before the next row. Baseline on final head before this doc commit: **221** files passed, **2277** passed, **4** skipped.

| Id       | Mutant                                                                                                                     | Killing test(s)                                                                                                                                                                                              | Result     |
| -------- | -------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------- |
| M1016-1a | `physio-mcp-tool-service.ts`: use `connector.share_link` without `open_share_link` guard                                   | (full suite green)                                                                                                                                                                                           | Equivalent |
| M1016-1b | `program-publish-service.ts` `getShareConnectorView`: build share URL whenever `openLink` exists; ignore `shareLinkStatus` | `mcp-tools-real-data.test.ts` > get_program_share_link_or_pdf over HTTP… (`assertConnectorViewInactive` on expired/closed/boundary/superseded); plus program-builder share_link_status pinned-clock coverage | Killed     |
| M1016-1c | `ShareLinksRepository.findOpenByProgramId`: drop `AND closed_at IS NULL`                                                   | `mcp-tools-real-data.test.ts` > get_program_share_link_or_pdf over HTTP… (republish open vs superseded token setup); plus program-builder share_link_status pinned-clock coverage                            | Killed     |
| M1016-2  | `program-builder-service.ts` `assertProgramAccess`: drop `created_by` ownership check                                      | `mcp-tools-real-data.test.ts` > cross-owner get_program_builder_link…; `program-builder-service-from-routine.test.ts`; plus existing program-builder cross-practitioner guard tests                          | Killed     |

## M1016-1b full-suite tail (verbatim)

```
 Test Files  1 failed | 220 passed (221)
      Tests  1 failed | 2276 passed | 4 skipped (2281)
```

```
 FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > get_program_share_link_or_pdf over HTTP returns no live share_link or pdf_url for expired, closed, boundary, and superseded links
AssertionError: expired-view: expected 'https://app.example.com/l/j8yAWfyj-Hm…' to be '' // Object.is equality
 ❯ assertConnectorViewInactive test/mcp-tools-real-data.test.ts:529:40
```

## M1016-1c full-suite tail (verbatim)

```
 Test Files  4 failed | 217 passed (221)
      Tests  4 failed | 2273 passed | 4 skipped (2281)
```

```
 FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > get_program_share_link_or_pdf over HTTP returns no live share_link or pdf_url for expired, closed, boundary, and superseded links
AssertionError: expected 'ou5V2_7ufYHOyoW33uLte_2mVc35ORt4uOLaM…' not to be 'ou5V2_7ufYHOyoW33uLte_2mVc35ORt4uOLaM…' // Object.is equality
 ❯ test/mcp-tools-real-data.test.ts:574:36
```

## M1016-2 full-suite tail (verbatim)

```
 Test Files  5 failed | 216 passed (221)
      Tests  19 failed | 2258 passed | 4 skipped (2281)
```

```
 FAIL  test/mcp-tools-real-data.test.ts > MCP tools with real data (DIDI-1016) > cross-owner get_program_builder_link matches missing-code not-found and does not leak owner data
AssertionError: expected undefined to be true // Object.is equality
 ❯ expectCrossOwnerBuilderNotFound test/mcp-tools-real-data.test.ts:704:31
```

**Totals:** 4 mutants run against the full suite, **3 killed**, **1 equivalent**, **0 survived**.
