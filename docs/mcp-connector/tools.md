# Physio MCP connector tools

Contract-only definitions in `src/mcp-connector/`. Each tool has a name, description, input JSON Schema, and output JSON Schema.

Every tool response includes a plain text `summary`, a `share_link` (HTTPS URL or empty string), and a `manage_url` to the web app. Search tools include `search_link` when there are zero results (prefilled web app search URL from server config).

Search tools paginate with `limit` (default 10, max 25) and opaque `cursor`, and return `next_cursor` when more results exist.

## Tools

| Tool name                       | Purpose                                                                                                                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `search_approved_exercises`     | Read-only search over approved exercises visible to the connector.                                                                                                                                        |
| `search_routines`               | Search community and personal routine copies.                                                                                                                                                             |
| `build_or_edit_program`         | Create or replace a program (full `rows` list). Create from a routine with `from_routine_id`; edit by `program_code`. Rows use `exercise_version_id` or `exercise_name`.                                  |
| `get_program_share_link_or_pdf` | Read draft/published state, or publish with `publish: true` after explicit practitioner confirmation. Returns `share_link`, `pdf_url`, and `expires_at` when a published version exists or after publish. |

## Shared data shapes

- Exercise categories: `Stretching`, `Strengthening`.
- Prescription types per program row: `stretching`, `isometric`, `concentric`, `eccentric`.
- Row params keys: `reps`, `sets`, `hold_s`, `ascent_s`, `descent_s`, `rest_s`, `per_day`, `days_per_week`. Values are numbers or `{ min, max }` ranges where noted in schema descriptions.
- Free-text caps: query 100, program_title 80, routine_name 80, row_notes 300, requested_exercise_name 100.
- Programs are identified by `program_code` and optional non-identifying `program_title`.
- Missing exercises on build: `exercises_not_found` with up to three `candidate_matches` and prefilled search URL via server config and `WEB_APP_EXERCISE_SEARCH_PATH`.
- Publish expiry overrides: `overrides.expires_in` is `1_week`, `30_days`, `90_days`, `1_year`, `never`, or `custom_date` (with `overrides.custom_date`). Republishing keeps the same `share_link`.

See `src/mcp-connector/` for authoritative schemas.
