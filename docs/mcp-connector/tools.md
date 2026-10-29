# Physio MCP connector tools

Contract-only definitions in `src/mcp-connector/`. Each tool has a name, description, input JSON Schema, and output JSON Schema.

Every tool response includes a plain text `summary` and a `share_link` URL string (CTO decision, Oct 23, 2026). When no program link applies, `share_link` is an empty string.

## Tools

| Tool name                       | Purpose                                                                                                               |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `search_approved_exercises`     | Read-only search over approved exercises visible to the connector.                                                    |
| `search_routines`               | Search community and personal routine copies.                                                                         |
| `build_or_edit_program`         | Create a program from scratch or from a routine, or edit one existing program found by code or non-identifying title. |
| `get_program_share_link_or_pdf` | Return a program share link and/or PDF URL for an existing program.                                                   |

## Shared data shapes

- Exercise categories: `Stretching`, `Strengthening`.
- Prescription types per program row: `stretching`, `isometric`, `concentric`, `eccentric`.
- Row params keys: `reps`, `sets`, `hold_s`, `ascent_s`, `descent_s`, `rest_s`, `per_day`, `days_per_week`. Values are numbers or `{ min, max }` ranges where noted in schema descriptions.
- Programs are identified by `program_code` and optional non-identifying `program_title`.
- Missing exercises: responses can include `web_app_exercise_search_url`, built from a configurable web app base URL plus a prefilled search query (not hardcoded to production).

See `src/mcp-connector/` for authoritative schemas.
