# MCP connector tool contract

Runtime-neutral JSON Schema definitions for the Physio MCP connector. Implements DIDI-989 and DIDI-1242 write-tool additions; stub hosting is DIDI-991 (`docs/architecture/mcp-server-stub-hosting.md`).

## Location

- Module: `src/mcp-connector/`
- Tool list doc: `docs/mcp-connector/tools.md`

## Tools (locked product direction)

Eight tools in `PHYSIO_MCP_TOOLS`: four read tools and four write tools (`create_or_edit_program`, `publish_program`, `set_program_link_expiry`, `delete_program`). No exercise creation; no patient-identifying field names in any schema.

The Worker MCP server lists only `PHYSIO_MCP_WIRED_TOOLS` (the four read tools) until DIDI-1244–1247 implement write handlers. The full contract and golden fixture include write tools for codegen and review.

Write tools use per-tool MCP annotations: `create_or_edit_program` is non-destructive write (`readOnlyHint: false`, `destructiveHint: false`); publish, set expiry, and delete are destructive writes (`destructiveHint: true`). All tools keep `openWorldHint: false`.

**Tool descriptions (DIDI-1251 / spec PR132, merge `5c02d0b`):** `publish_program`, `set_program_link_expiry`, and `delete_program` use APPROVED #25–#27 from `design/connector/claude-connector/spec.md` (includes ask-and-wait confirm instruction). `create_or_edit_program` has **no** approved tool description (empty string; listed in omissions doc). No server confirm token.

## Privacy

Enforcement is structural, not full content scanning: JSON Schema maxLength caps on free-text fields, property names must not match patient-info patterns (unit test), each tool's property set is pinned, **read-tool** field descriptions forbid patient details, **write-tool free-text inputs** use exactly `Do not pass patient information.` on the fields named in spec PR132 (`program_title`, `row_notes`, row `exercise_name`; CTO ruling `343fc67a` — not on write outputs), and `validateFreeTextForPatientDetails` in the contract rejects obvious emails, phone numbers, Ontario health-card-shaped numbers, and date-of-birth-like dates (DIDI-991 runs this on wired read tools on the server). Tests pin the validator on capped write **input** paths in `mcp-connector-rulings.test.ts`; write handlers are unwired until DIDI-1244–1247. This is a regression guard, not a privacy guarantee.

## Platform

The contract module must not import Node, Cloudflare Workers, or other runtime-specific packages. Verified by test.

## Write-tool schema fields without v13 `description` (DIDI-1251)

Write-tool JSON Schema fields without approved copy are listed in [`docs/mcp-connector/write-schema-omitted-descriptions.md`](../mcp-connector/write-schema-omitted-descriptions.md) (regenerate with `npx tsx scripts/list-mcp-write-schema-omissions.ts`; kept in sync by `test/mcp-connector-write-omissions-doc-sync.test.ts`). **Free-text write inputs** per DIDI-1251 / CTO `343fc67a`: exactly `Do not pass patient information.` on `program_title`, `row_notes`, and row `exercise_name` only; write outputs and non-v13 read-reused field descriptions (summary, `program_code`, links, version fields, etc.) omit `description` entirely.
