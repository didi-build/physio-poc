# Body region picker (exercise form)

Area: app · Feature: body-region-picker

## Purpose

When exercise save forms wire the approved template field (`design/reference/web-app/generated/draftData.ts` `TEXT_META` key `region`, label "Body region"), replace free text with this combobox: pick an existing catalog region, or on **add-new-exercise** flows only add a region inline while saving the exercise. A new region is not managed on its own; it becomes visible in library search and filters only when that exercise goes live.

**Today:** `src/ui/exercise-requests/DraftReviewPage.tsx` does **not** render a body region field. No exercise library editor in `src/ui/exercise-library/` renders a body region input today.

**Matches Product direction: yes.** Checked against DIDI-594 lock Nov 18, 2026, 2:58 PM EST and Diadem approval Nov 18, 2026, 3:14 PM EST on [DIDI-1253](https://linear.app/didi-build/issue/DIDI-1253).

## Body region field in the app today

Only one screen in `src/ui` renders an editable **Body region** control:

| File | What it shows |
| -- | -- |
| `src/ui/routines/RoutineDraftEditorPage.tsx` | Label **Body region** (`src/ui/copy/routines.ts` `BODY_REGION`) with pill buttons from `listBodyRegions()` (`bodyRegionOptions`), not a text field or this combobox |

Exercises and Routines **filter** panels use the label **Body region** for pill filters only (`src/ui/exercise-library/FiltersSortPanel.tsx`, `src/ui/routines/RoutinesFiltersSortPanel.tsx`). Those pills are fixed lists in code (`src/ui/exercise-library/library-filters.ts` `BODY_REGION_PILLS`, `src/ui/routines/routine-library-filters.ts` `ROUTINE_BODY_REGION_PILLS`), not live region catalogs and not exercise form fields.

`src/ui/exercise-library/ExerciseDetailsPage.tsx` shows **Body regions** read-only (`BODY_REGIONS`); it is display, not an input.

## Scope by screen (CTO, DIDI-1253)

| Context | Add row and new regions | Picker mode |
| -- | -- | -- |
| Adding a new exercise (request, AI draft review, first save paths) | Yes: inline **Add {region}** when the typed value is not an exact catalog match | Full combobox including add row |
| Edit for everyone, Edit my copy, and other edit-existing-exercise forms | No: pick existing catalog regions only; no **Add {region}** row; cannot create a region on edit | Pick-existing-only |

**Open: needs Diadem decision ([DIDI-1256](https://linear.app/didi-build/issue/DIDI-1256)):** Confirm pick-existing-only on edit screens matches product intent (CTO ruling on DIDI-1253).

## Data model (CTO, DIDI-1253)

The picker is **single-choice**. The saved exercise uses one region, stored as a one-element array: `body_regions: [region]` (same shape as list cards and details today expect a `body_regions` array with one entry).

If the AI drafter returns more than one body region, take only the first entry from that array. That entry becomes the combobox value (then normalized with `capitalizeBodyRegionLabel` for display and save). Any other AI-returned regions are dropped at the picker boundary; they are not shown as a multi-select.

## Design source (approved Nov 18, 2026, 3:14 PM EST)

| Component | MagicPath link | Component id | Final revision |
| -- | -- | -- | -- |
| Variant A, Inline Add row | https://designs.magicpath.ai/v1/friendly-pond-1383 | 473895725248430080 | 473895725248430081 |

Diadem, Nov 18, 2026, 3:14 PM EST (locked on DIDI-594), verbatim: "variant A. i approve the strings"

Ignore the MagicPath preview state switcher ("Preview", tab labels, and notes under it). That chrome is not product UI.

## Locked Product direction (verbatim)

**DIDI-594**, Diadem, Nov 18, 2026, 2:58 PM EST:

> i think they are added when exercises are added. they dont need to add a new exercise independently. so a new body region goes live when it's corresponding exercise goes live

No standalone region management page. A new body region is saved with its exercise and goes live only when that exercise goes live.

## Layout (mobile first, 390 px)

Derived from MagicPath variant A `AInlineAddRow.tsx` (revision 473895725248430081). On edit screens, omit the inline add row (pick-existing-only).

- Form column `max-w-[390px]`, page padding `px-4 py-6`, background `#f8fafc`, body text `#0f172a`, Inter stack.
- Exercise title: `text-2xl font-semibold` (example content in the mockup only).
- Section heading **Basics**: `text-xs font-semibold uppercase tracking-[0.04em] text-[#64748b]`, `mt-6 mb-3`.
- Field label **Body region**: same uppercase label style, linked with `htmlFor` to the combobox input.
- Combobox input: full width, `min-h-11` (44 px touch target), `rounded-xl`, border `#cbd5e1`, focus border and ring `#0f766e`.
- Trailing chevron control inside the field: 32 px square (`h-8 w-8`), `min-h-11` row overall; toggles the list open or closed; `tabIndex={-1}` so keyboard focus stays on the input.
- Dropdown list: `absolute`, full width, `max-h-72`, `rounded-2xl`, border `#e2e8f0`, shadow; z-index above the form.
- List rows and the inline add row: `min-h-11` buttons, horizontal padding `px-3.5`, `text-sm font-semibold`.
- Existing row hover or keyboard highlight: teal wash `rgb(240 253 250 / 0.8)`.
- Inline add row (add-new-exercise only): top border `#f1f5f9`, teal text `#115e59`, plus icon 16 px; highlight background `#f0fdfa`; trailing **New** pill (white background, `#115e59` text, `text-[11px]`).
- After a new or AI-backed selection on add flows (not an existing catalog pick): **New** tag below the field, `rounded-full`, background `#f0fdfa`, text `#115e59`, `text-[11px] font-semibold`.
- Selected existing option: teal check icon at the right of the row.

## Region label casing (one rule)

Use `capitalizeBodyRegionLabel` from `src/ui/routines/body-region-display.ts` for every user-visible region string and for the value committed when adding a region: trim, then uppercase the first character only and leave the rest unchanged. Examples: `knee` to `Knee`, `lower back` to `Lower back`, `acl` to `Acl` (not `ACL` unless the user typed it that way). The inline **Add {region}** label, **New** tag context, combobox input after commit, and `body_regions: [region]` saved entry all use this same rule. List rows for catalog regions use the catalog label run through this function for display consistency.

## Combobox behaviour

| Behaviour | Rule |
| -- | -- |
| Filtering | Existing regions whose names contain the typed query, case insensitive (`includes`). |
| Open | Open on input focus, on typing, and when the chevron is clicked. Close on pointer down outside the picker root, on Escape, and after a choice that commits selection. |
| Query while open | Typing updates the query, keeps the list open, resets keyboard highlight to the first option. |
| Normalized add label | After trim, `capitalizeBodyRegionLabel` (see above). |
| When add row shows | Add-new-exercise flows only: normalized query is non-empty and does not exactly match an existing region (case insensitive). |
| When add row hides | Edit flows (always), or query empty, or exact catalog match. |
| Choose existing | Sets selection to that region, copies the display label into the input, closes the list. |
| Choose add row | Sets selection to the normalized new label (kind `new` or `ai`), copies into the input, closes the list. Saves as `body_regions: [region]`. |
| Empty query | All existing catalog regions in the list; no add row on add flows until the user types. |

## States

States 2 to 4 and the inline add row apply on **add-new-exercise** flows only. On edit screens, only state 1 (existing match) and empty query (state 4 without add) apply.

### 1. Existing match

The input shows a catalog region (example: "Hip"). The open list shows regions matching the query. The current selection row shows a teal check. Choosing another existing region updates selection and the input.

### 2. Typed new entry (add-new-exercise only)

The physio types a region that is not an exact catalog match (example: "Upper back"). The list shows any partial matches plus a final inline row: plus icon, **Add {region}** (example **Add Upper back**), and a **New** pill on that row. Choosing the row commits a pending new region for this exercise (kind `new`) and shows the **New** tag under the field until save.

See [mockup](mockups/02-typed-new-entry-phone.png).

### 3. AI-suggested new entry (add-new-exercise only)

The AI drafter prefills body region with a suggested value that is not an exact catalog match (concept demo: "Hamstrings"). The combobox shows that value; the list behaves like typed new (matches plus **Add {region}** when applicable). Approved strings **Keep** (N2) and **Change** (N3) apply in this state before first save.

**Open: needs Diadem decision ([DIDI-1256](https://linear.app/didi-build/issue/DIDI-1256)):** UI placement and interaction for **Keep** and **Change** (strings N2 and N3 are approved; layout is not locked).

### 4. Empty

Query is empty and there is no committed selection. The list shows every existing catalog region. On add flows there is no add row until the user types. On edit flows there is never an add row.

Clearing: deleting all text in the combobox reaches empty query. Variant A does not add a separate clear button on the picker.

## Loading, errors, and validation

These apply at the hosting screen level today; the picker inherits the same patterns when wired.

| Concern | Copy shown | Source / notes |
| -- | -- | -- |
| Page or form loading | No loading copy; skeleton only | `ExerciseLibraryBusyState` in `src/ui/exercise-library/ExerciseLibraryStates.tsx` (`aria-hidden` skeleton; no string in `src/ui/copy`) |
| Page load failure | No user-visible message until copy is defined | `ExerciseLibraryDetailErrorSlot` uses `EXERCISE_LIBRARY_DETAIL_ERROR_MESSAGE` in `src/ui/copy/exercise-library-states.ts` (currently `undefined`, empty slot) |
| Region catalog load failure | No picker-specific copy today | Same detail error slot pattern on the parent screen if the whole form fails to load; no dedicated string for region list fetch alone |
| Invalid or over-length region input | No field-level copy today | `body_regions.label` in migrations has `NOT NULL UNIQUE` only; no max-length CHECK and no validation message in `src/ui/copy` for body region |
| Save failure (exercise) | No exercise-editor save-failure strings in `src/ui/copy/exercise-requests.ts` today | Only **Save** / **Cancel** are defined there |
| Save failure (analogous routine draft) | Publish validation panel when publish rules fail | `VALIDATION_ADD_ROUTINE_NAME`, `VALIDATION_ADD_EXERCISE`, `BEFORE_YOU_PUBLISH`, `DRAFT_STILL_SAVED` in `src/ui/copy/routines.ts` via `RoutinePublishValidationPanel`; issues are `missing_name` and `missing_exercises` only, not body region |

### Open: needs Diadem approval

- User-visible copy if the region catalog fails to load inside an otherwise loaded exercise form (described need only; no proposed wording).
- User-visible copy for invalid or duplicate region name on add (described need only; no proposed wording).
- User-visible copy for exercise save failure attributable to body region (described need only; no proposed wording).

Preview switcher strings ("Preview", "Existing match", "Typed new", "AI suggested", "Empty", and `aria-label` "Preview states") are design chrome only, not product copy.

### Open: needs Diadem decision

- [DIDI-1256](https://linear.app/didi-build/issue/DIDI-1256): Pick-existing-only on edit screens (no add row, no new regions on edit).
- [DIDI-1256](https://linear.app/didi-build/issue/DIDI-1256): Placement for **Keep** and **Change** in the AI-suggested state.

## Keyboard and accessibility

| Input | Behaviour |
| -- | -- |
| ArrowDown | Open if needed; move highlight to next option (clamped at last). |
| ArrowUp | Move highlight to previous option (clamped at first). |
| Enter | Activate the highlighted option (existing or add row when present). |
| Escape | Close the list without changing selection. |

ARIA (from variant A):

- Input: `role="combobox"`, `aria-expanded`, `aria-controls` (list id), `aria-autocomplete="list"`, `aria-activedescendant` pointing at the highlighted `option` id when open.
- List: `role="listbox"`, `aria-label` **Body region** (same string as the visible label).
- Options: `role="option"`, `aria-selected` for the committed existing match; add row `aria-selected={false}`.
- Chevron: `aria-label` **Body region** (expands or collapses the list).
- Decorative icons: `aria-hidden`.

## Strings

### APPROVED (Diadem, Nov 18, 2026, 3:14 PM EST)

| Id | String | Notes |
| -- | -- | -- |
| N1 | Add {region} | Example: Add Upper back; add-new-exercise flows only |
| N2 | Keep | AI-suggested new region |
| N3 | Change | AI-suggested new region |

### Reused existing strings

| String | Source |
| -- | -- |
| Body region | `src/ui/copy/exercise-library.ts` `BODY_REGION` |
| New | `src/ui/copy/exercise-library.ts` `TAG_NEW` |
| Clear | `src/ui/copy/exercise-library.ts` `CLEAR` |
| Save | `src/ui/copy/exercise-requests.ts` `SAVE` |
| Cancel | `src/ui/copy/exercise-requests.ts` `CANCEL` |
| Basics | `src/ui/copy/exercise-requests.ts` `BASICS` (section heading on the same form) |

## Decisions

1. Variant A inline add row on add-new-exercise only; no separate "create region" screen.
2. Edit-existing-exercise forms: pick-existing-only, no add row (CTO; Diadem decision pending DIDI-1256).
3. Single region per exercise: `body_regions: [region]` (CTO).
4. New regions are saved with the exercise; fixed filter pills in code update only when product wiring expands those lists.
5. AI suggestions use the same combobox on add flows; **Keep** / **Change** placement open on DIDI-1256.
6. Exact match to an existing region never shows the add row.
7. Touch targets at least 44 px on the input, list rows, add row when shown, and chevron hit area.

## Mockups

| State | Phone (390 px) |
| -- | -- |
| 02 typed new entry | [phone](mockups/02-typed-new-entry-phone.png) |

Other states follow the rules above; additional PNGs can be added in a follow-up render pass.

## Changes

- **Nov 18, 2026**: DIDI-1253 QA and CTO ruling: accurate today-app table, casing rule, edge-case copy inventory, pick-existing-only on edit (DIDI-1256), `body_regions: [region]`, design source component id. https://linear.app/didi-build/issue/DIDI-1253
- **Nov 18, 2026**: DIDI-1253. Variant A approved by Diadem (3:14 PM EST). Product direction lock (2:58 PM EST). https://linear.app/didi-build/issue/DIDI-1253