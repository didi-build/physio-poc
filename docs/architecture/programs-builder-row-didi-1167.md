# Programs builder row dose box (DIDI-1167)

Area: app · Programs builder exercise row dose readout and inline editor

## Scope

Match approved MagicPath v12 dose box behavior in `design/reference/web-app/generated/WebAppClickableConcept.tsx` (grey box, bold readout, Adjust inline editor, source note, edited or reset state). User facing copy comes from `design/app/programs/spec.md` Copy inventory and v12 `SOURCE_TEXT` where listed in `src/ui/copy/programs.ts`.

## Data

- **Stored doses:** `program_rows.params_json` holds the row snapshot (existing).
- **Source for the note and reset target:** Builder view rows include `resolved_params` and `resolved_params_source` from `resolveExerciseParams` precedence (my exercise override, then my type defaults, then global), aligned to `src/domain/resolve-exercise-params.ts`.
- **Edited detection:** `params` JSON differs from `resolved_params` after filtering to keys allowed for the row prescription type.
- **params_source on the wire:** When the row matches resolved defaults, `params_source` is the resolved precedence label. When edited, it is `null` so the client does not show two sources; the default line uses `resolved_params_source`.

## API

No new routes. Saving uses existing `PATCH` row with `params` and the program auto-save path from DIDI-1149.

## Related

- Layout-only precursor: DIDI-1165 (`docs/architecture/programs-builder-row-didi-1165.md`)
