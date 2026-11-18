# MCP connector tool contract

Runtime-neutral JSON Schema definitions for the Physio MCP connector. Implements DIDI-989 and DIDI-1242 write-tool additions; stub hosting is DIDI-991 (`docs/architecture/mcp-server-stub-hosting.md`).

## Location

- Module: `src/mcp-connector/`
- Tool list doc: `docs/mcp-connector/tools.md`

## Tools (locked product direction)

Eight tools in `PHYSIO_MCP_TOOLS`: four read tools and four write tools (`create_or_edit_program`, `publish_program`, `set_program_link_expiry`, `delete_program`). No exercise creation; no patient-identifying field names in any schema.

The Worker MCP server lists only `PHYSIO_MCP_WIRED_TOOLS` (the four read tools) until DIDI-1244–1247 implement write handlers. The full contract and golden fixture include write tools for codegen and review.

Write tools use per-tool MCP annotations: `create_or_edit_program` is non-destructive write (`readOnlyHint: false`, `destructiveHint: false`); publish, set expiry, and delete are destructive writes (`destructiveHint: true`). All tools keep `openWorldHint: false`.

**HELD (DIDI-1251):** There is no CTO-approved assistant-facing confirm instruction (ask and wait for explicit yes before publish, delete, or set expiry). Tool descriptions carry only user-facing v13 sample lines; behaviour prose in spec.md:338, 340–343, and 389 is out of scope for this PR. No server confirm token. See CTO comment `e1b1cb2d` on DIDI-1242.

## Privacy

Enforcement is structural, not full content scanning: JSON Schema maxLength caps on free-text fields, property names must not match patient-info patterns (unit test), each tool's property set is pinned, **read-tool** field descriptions forbid patient details, **write-tool** free-text field descriptions are the DIDI-594 comment `5d59df38` sentence only (`Do not pass patient information.`), and `validateFreeTextForPatientDetails` in the contract rejects obvious emails, phone numbers, Ontario health-card-shaped numbers, and date-of-birth-like dates (DIDI-991 runs this on wired read tools on the server; write tools pin the same validator over every capped free-text input path in tests). This is a regression guard, not a privacy guarantee.

## Platform

The contract module must not import Node, Cloudflare Workers, or other runtime-specific packages. Verified by test.

## Write-tool schema fields without v13 `description` (DIDI-1251)

Until CTO approves assistant-facing copy, write-tool JSON Schema fields listed in [`docs/mcp-connector/write-schema-omitted-descriptions.md`](../mcp-connector/write-schema-omitted-descriptions.md) (regenerate with `npx tsx scripts/list-mcp-write-schema-omissions.ts`) have **no** `description` — type and constraints only; **free-text write fields** are excluded and instead use the `5d59df38` sentence. HELD confirm instruction remains **DIDI-1251**. Output `source_routine_id` keeps `routineIdProperty` text from the read-tool spec. Mechanics are noted in `src/mcp-connector/json-schema.ts` comments.
