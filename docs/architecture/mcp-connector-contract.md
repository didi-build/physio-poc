# MCP connector tool contract

Runtime-neutral JSON Schema definitions for the Physio MCP connector. Implements DIDI-989 and DIDI-1242 write-tool additions; stub hosting is DIDI-991 (`docs/architecture/mcp-server-stub-hosting.md`).

## Location

- Module: `src/mcp-connector/`
- Tool list doc: `docs/mcp-connector/tools.md`

## Tools (locked product direction)

Eight tools in `PHYSIO_MCP_TOOLS`: four read tools and four write tools (`create_or_edit_program`, `publish_program`, `set_program_link_expiry`, `delete_program`). No exercise creation; no patient-identifying field names in any schema.

The Worker MCP server lists only `PHYSIO_MCP_WIRED_TOOLS` (the four read tools) until DIDI-1244–1247 implement write handlers. The full contract and golden fixture include write tools for codegen and review.

Write tools use per-tool MCP annotations: `create_or_edit_program` is non-destructive write (`readOnlyHint: false`, `destructiveHint: false`); publish, set expiry, and delete are destructive writes (`destructiveHint: true`). All tools keep `openWorldHint: false`.

Publish, set expiry, and delete require explicit user confirmation in the assistant conversation before the tool is called. There is no server confirm token.

## Privacy

Enforcement is structural, not full content scanning: JSON Schema maxLength caps on free-text fields, property names must not match patient-info patterns (unit test), each tool's property set is pinned, field descriptions forbid patient details, and `validateFreeTextForPatientDetails` in the contract rejects obvious emails, phone numbers, Ontario health-card-shaped numbers, and date-of-birth-like dates (DIDI-991 runs this on the server). This is a regression guard, not a privacy guarantee.

## Platform

The contract module must not import Node, Cloudflare Workers, or other runtime-specific packages. Verified by test.
