# Physio MCP connector tools

Contract-only definitions in `src/mcp-connector/`. Each tool has a name, description, input JSON Schema, output JSON Schema, and read-only MCP annotations (`readOnlyHint: true`, `destructiveHint: false`, `openWorldHint: false`).

Every tool response includes a plain text `summary`, a `share_link` (HTTPS URL or empty string), and usually a `manage_url` or deep link field. Search tools include `search_link` when there are zero results (prefilled web app search URL from server config).

Search tools paginate with `limit` (default 10, max 25) and opaque `cursor`, and return `next_cursor` when more results exist.

Deep links are built from the shared route table in `src/app-routes.ts` (also used by the SPA router).

## Tools

| Tool name                       | Purpose                                                                                                                                                                                                                                           |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_approved_exercises`     | Read-only search over approved exercises visible to the connector.                                                                                                                                                                                |
| `search_routines`               | Read-only search over community and personal routine copies.                                                                                                                                                                                      |
| `get_program_builder_link`      | Read-only deep link to the web app program builder. Optional `program_code`, optional `from_routine_id`, or neither for a new blank program. Returns `builder_link`.                                                                              |
| `get_program_share_link_or_pdf` | Read-only lookup by `program_code` or `program_title`. Returns published `share_link` and `pdf_url` when live; `publish_link` when a draft needs publishing; `manage_link` for expiry, close link, and delete on the share page. Never publishes. |

## Shared data shapes

- Exercise categories: `Stretching`, `Strengthening`.
- Prescription types (program rows in the web app): `stretching`, `isometric`, `concentric`, `eccentric`.
- Free-text caps: query 100, program_title 80, routine_name 80.
- Programs are identified by `program_code` and optional non-identifying `program_title`.
- App route names include `exerciseSearch`, `programBuilder`, `programPublish`, and `programShare` (see `src/app-routes.ts`).

See `src/mcp-connector/` for authoritative schemas.
