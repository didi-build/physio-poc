# Physio MCP connector tools

Contract-only definitions in `src/mcp-connector/`. Each tool has a name, description, input JSON Schema, output JSON Schema, and MCP annotations (`readOnlyHint`, `destructiveHint`, `openWorldHint`).

Every tool response includes a plain text `summary`, a `share_link` (HTTPS URL or empty string), and usually a `manage_url` or deep link field. Search tools include `search_link` when there are zero results (prefilled web app search URL from server config).

Search tools paginate with `limit` (default 10, max 25) and opaque `cursor`, and return `next_cursor` when more results exist.

Deep links are built from the shared route table in `src/app-routes.ts` (also used by the SPA router).

## Tools

| Tool name                       | Annotations        | Purpose                                                                                                                                                                                                                                 |
| ------------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_approved_exercises`     | read-only          | Search over approved exercises visible to the connector.                                                                                                                                                                                |
| `search_routines`               | read-only          | Search over community and personal routine copies.                                                                                                                                                                                      |
| `get_program_builder_link`      | read-only          | Deep link to the web app program builder. Optional `program_code`, optional `from_routine_id` (UUID v4 opaque id), or neither for a new blank program. When both are given, `program_code` wins. Returns `builder_link`.                |
| `get_program_share_link_or_pdf` | read-only          | Lookup by `program_code` or `program_title`. Returns published `share_link` and `pdf_url` when live; `publish_link` when a draft needs publishing; `manage_link` for expiry, close link, and delete on the share page. Never publishes. |
| `create_or_edit_program`        | write              | Create a program or replace rows on an existing draft. Optional `from_routine_id` copies a routine. Never publishes.                                                                                                                    |
| `publish_program`               | write, destructive | Publish the current draft after explicit user confirmation in the conversation (assistant-side only). Optional `overrides.expires_in` and `overrides.custom_date`.                                                                      |
| `set_program_link_expiry`       | write, destructive | Change one program's link expiry. Call directly when the user's message already names the date or expiry; otherwise confirm first (assistant-side only).                                                                                |
| `delete_program`                | write, destructive | Delete a program after explicit confirmation; closes an open share link; restorable for 30 days in the web app.                                                                                                                         |

The live MCP server currently registers only the four read tools (`PHYSIO_MCP_WIRED_TOOLS`). Write tools are contract-only until DIDI-1244–1247 wire handlers. Calling an unwired write tool name returns text `Unknown tool: <name>` with `isError: true` (validation rejects the name before handlers run).

## Shared data shapes

- Exercise categories: `Stretching`, `Strengthening`.
- Prescription types (program rows in the web app): `stretching`, `isometric`, `concentric`, `eccentric`.
- Free-text caps: query 100, program_title 80, routine_name 80, row_notes 300, requested exercise name 100.
- Share link expiry choices: `1_week`, `30_days`, `90_days`, `1_year`, `never`, `custom_date` (see `src/mcp-connector/share-link-expiry.ts`).
- Programs are identified by `program_code` and optional non-identifying `program_title`.
- App route names include `exerciseSearch`, `programBuilder`, `programPublish`, and `programShare` (see `src/app-routes.ts`).

See `src/mcp-connector/` for authoritative schemas.
