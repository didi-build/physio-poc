# Programs builder row visual layout (DIDI-1165)

Area: app · Programs builder exercise list

## Scope

Visual alignment of each program row card and the exercises section header with approved MagicPath v12 (`design/reference/web-app/generated/WebAppClickableConcept.tsx`, builder block) and `design/app/programs/spec.md`. No API, schema, or save-path changes in this ticket.

## Row content

Row data comes from `ProgramBuilderView.rows` (`ProgramBuilderRow`). Optional header elements render only when the type already carries the data:

- Exercise thumbnail: not in `ProgramBuilderRow`; the row does not render a photo until a future field exists.
- Category line with icon: derived from `prescription_type` and `TYPE_LABELS` (same labels as v12 `TYPE_LABEL` for those types).
- Badges: `library_update` drives a teal library-available line when present; `kind === "placeholder"` shows the spec string "Pending review" as in v12.

## Test-only reorder controls

Row reorder remains implemented in `ProgramBuilderPage` via `reorder` and `client.reorderRows`, but visible up and down buttons are removed per DIDI-1165 and DIDI-1152. Vitest loads the UI with `import.meta.env.MODE === "test"`; in that mode the row card renders hidden `data-testid` buttons wired to the same `onMoveUp` / `onMoveDown` callbacks so existing integration tests for autosave and `reorderRows` stay valid without exposing fake controls in production.

## Related

- CTO scope: Linear comment 050cbb88 on DIDI-1165
- Dose editor: out of scope (DIDI-1167)
- Drag and reorder wiring: out of scope (DIDI-1166)
