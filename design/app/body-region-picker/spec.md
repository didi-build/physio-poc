# Body region picker (exercise form)

Area: app · Feature: body-region-picker

## Purpose

When exercise save forms wire the approved template field (`design/reference/web-app/generated/draftData.ts` `TEXT_META` key `region`, label "Body region"), replace free text with a multi-select chip field plus typeahead: chosen regions render as chips; the physio types in a search field to pick existing catalog regions or, on add-new-exercise flows, add a region with the inline **Add {region}** row (variant A inside variant B). A new region is not managed on its own; it goes live when that exercise goes live.

**Today:** `src/ui/exercise-requests/DraftReviewPage.tsx` does **not** render a body region field. No exercise library editor in `src/ui/exercise-library/` renders a body region input today.

**Matches Product direction: yes.** Checked against DIDI-594 lock Nov 18, 2026, 2:58 PM EST and Diadem approvals Nov 18, 2026 on [DIDI-1253](https://linear.app/didi-build/issue/DIDI-1253).

## Body region field in the app today

Only one screen in `src/ui` renders an editable **Body region** control:

| File | What it shows |
| -- | -- |
| `src/ui/routines/RoutineDraftEditorPage.tsx` | Label **Body region** (`src/ui/copy/routines.ts` `BODY_REGION`) with pill buttons from `listBodyRegions()` (`bodyRegionOptions`), not this chip plus typeahead control |

Exercises and Routines **filter** panels use the label **Body region** for pill filters only (`src/ui/exercise-library/FiltersSortPanel.tsx`, `src/ui/routines/RoutinesFiltersSortPanel.tsx`). Those pills are fixed lists in code (`src/ui/exercise-library/library-filters.ts` `BODY_REGION_PILLS`, `src/ui/routines/routine-library-filters.ts` `ROUTINE_BODY_REGION_PILLS`), not live region catalogs and not exercise form fields.

`src/ui/exercise-library/ExerciseDetailsPage.tsx` shows **Body regions** read-only (`BODY_REGIONS`); it is display, not an input.

## Scope by screen

| Context | Add row and new regions | Picker mode |
| -- | -- | -- |
| Adding a new exercise (request, AI draft review, first save paths) | Yes: inline **Add {region}** when nothing matches and the typed text is not an existing or already-selected region | Chips plus typeahead with add row |
| Edit for everyone, Edit my copy, and other edit-existing-exercise forms | **Open: needs Diadem decision ([DIDI-1256](https://linear.app/didi-build/issue/DIDI-1256)):** whether new regions can be added on edit. Until decided, pick from existing catalog regions only; no **Add {region}** row on edit | Existing regions only on edit (interim) |

## Data model

The exercise stores **multiple** body regions as `body_regions: string[]` (same array shape as list cards and exercise details today).

When the AI drafter returns several regions, **keep all of them**: pre-fill one chip per region. Regions already in the catalog use an existing chip style; regions not in the catalog use a **New** chip (AI-suggested new region).

## Design source (approved Nov 18, 2026)

| Component | MagicPath link | Component id | Revision | Status |
| -- | -- | -- | -- | -- |
| A+B r4: typing hint (final) | https://designs.magicpath.ai/v1/wondrously-tide-3357 | 473932751381368832 | 473932751381368833 | Approved 5:49 PM ET |
| Variant A, Inline Add row | https://designs.magicpath.ai/v1/friendly-pond-1383 | 473895725248430080 | 473895725248430081 | Approved 3:14 PM ET (add row) |
| Variant B, Chips | https://designs.magicpath.ai/v1/eager-winter-5934 | 473894671903518720 | (see MagicPath) | Chip shell |
| r3 typing hint | https://designs.magicpath.ai/v1/safe-morning-6698 | 473931095931523072 | (see MagicPath) | Superseded by r4 |

**Diadem, Nov 18, 2026, 5:26 PM ET**, verbatim:

> hmm I think technically an exercise can target multiple areas (for example, glutes and quads). so it should be a text field that as you type it shows suggestions. if there are no suggestions then add row (variant a). once they click that, it becomes a chip (variant b)

**Diadem, Nov 18, 2026, 5:34 PM ET** (on r3), verbatim:

> mostly good, however it's not clear that a use can type there. maybe add a hint and the | marker while they're typing

**Diadem, Nov 18, 2026, 5:49 PM ET**, verbatim:

> I approve this version and the hint "Type to search or add a region"

**Diadem, Nov 18, 2026, 3:14 PM ET**, verbatim: "variant A. i approve the strings" (**Add {region}**, **Keep**, **Change**).

## Locked Product direction (verbatim)

**DIDI-594**, Diadem, Nov 18, 2026, 2:58 PM EST:

> i think they are added when exercises are added. they dont need to add a new exercise independently. so a new body region goes live when it's corresponding exercise goes live

No standalone region management page.

## Layout

Mobile first (390 px). Desktop: field block `max-width: 40rem`, centered on `slate-50` (`#f8fafc`) page background. Font: Inter.

### Label

**Body region**: `text-xs font-semibold uppercase tracking-wide text-slate-500`, linked to the typeahead input.

### Selected chips (variant B)

Row below the label: `flex flex-wrap gap-2` (8 px gap), `min-h-11` (44 px) touch area per chip.

| Chip kind | Style |
| -- | -- |
| Existing catalog region | `rounded-full`, fill `#0f766e` (teal-700), white text, semibold `text-sm` |
| New region (not in catalog or AI-new) | `rounded-full`, fill `#f0fdfa`, border `#0f766e`, text `#115e59`, plus white pill **New** tag (`TAG_NEW`) on the chip |
| Remove control | Visible text button **Clear** on each chip: `h-8`, `min-w-8`, `rounded-full`, `text-xs` semibold; `white/90` on existing chips, `#115e59` on New chips (reuses `CLEAR`, `src/ui/copy/exercise-library.ts` line 12) |

### Typeahead field

Below the chip row: `relative`, full width of the field block.

- Input container: `rounded-xl`, `min-h-11`, white background, border `slate-300`; focused border and ring `teal-700` / `teal-700/30`.
- Left: search magnifier icon, `slate-400`, decorative (`aria-hidden`).
- Right: chevron toggles list open (decorative control; `tabIndex={-1}`).
- Placeholder (empty, unfocused or focused with no text): **Type to search or add a region**, `slate-400`.
- While focused: show a teal-700 **|** caret after typed text, or before the placeholder when empty; blink `1s` steps (mockups freeze caret visible in stills).

### Dropdown list

`absolute`, full width, `max-h-72`, `rounded-2xl`, border `slate-200`, shadow; `z-20`.

- Catalog rows: `min-h-11`, semibold `text-sm`; keyboard/hover highlight `#f0fdfa`.
- Filter: case-insensitive substring match on the typeahead value; **exclude regions already on chips**.
- Add row (add-new-exercise flows only): only when **no** catalog row matches **and** typed text (after trim and `capitalizeBodyRegionLabel`) is not equal to an existing catalog region and not already selected. Plus icon, **Add {region}** semibold `#115e59`, **New** pill on the right (variant A row).

### After a pick

Choosing a list row or the add row: append chip (existing or new styling), clear typeahead text, close list, **keep focus** in the typeahead so another region can be added. **Clear** on a chip removes that chip only.

## Region label casing (one rule)

`capitalizeBodyRegionLabel` in `src/ui/routines/body-region-display.ts`: if length is 0 return as-is; else `charAt(0).toUpperCase() + slice(1)` (first character uppercased, **rest unchanged**). Examples: `knee` to `Knee`, `acl` to `Acl`, `ACL` stays `ACL`. Use for chip labels, list rows, add-row `{region}`, and values stored in `body_regions`.

## States (mockups)

| # | State | What it shows |
| -- | -- | -- |
| 01 | Matches | Typeahead `ne`; list shows **Knee** (highlighted) and **Neck** |
| 02 | Add row | Typeahead `Quads`; list shows only **Add Quads** with **New** pill |
| 03 | Chips | **Glutes** existing chip plus **Quads** new chip; typeahead empty, unfocused, placeholder visible |
| 04 | Empty | Typeahead focused, caret visible, placeholder visible, full catalog list: Knee, Hip, Ankle, Shoulder, Lower back, Neck, Glutes |

On add-new-exercise flows, state 02 and new chips apply. On edit flows (interim), state 02 and new chips do not apply until DIDI-1256 decides.

### AI-drafted regions

All AI-returned regions arrive as pre-filled chips. Catalog matches use existing chip styling; drafter-only names use **New** chips. Strings **Keep** (N2) and **Change** (N3) are approved but **not rendered** until placement is decided.

**Open: needs Diadem decision ([DIDI-1256](https://linear.app/didi-build/issue/DIDI-1256)):** UI placement for **Keep** and **Change**.

## Keyboard and accessibility

| Input | Behaviour |
| -- | -- |
| ArrowDown | Open if needed; move highlight (clamped). |
| ArrowUp | Move highlight (clamped). |
| Enter | Activate highlighted option (catalog or add row). |
| Escape | Close list. |

- Typeahead: `role="combobox"`, `aria-expanded`, `aria-controls`, `aria-autocomplete="list"`, `aria-activedescendant` on highlighted option when open.
- List: `role="listbox"`, `aria-label` **Body region**.
- Options: `role="option"`.
- Chip remove: visible text button **Clear** (`CLEAR`, `src/ui/copy/exercise-library.ts` line 12).
- Icons: `aria-hidden` where decorative.

## Loading, errors, and validation

| Concern | Copy shown | Source / notes |
| -- | -- | -- |
| Page or form loading | No loading copy; skeleton only | `ExerciseLibraryBusyState` in `src/ui/exercise-library/ExerciseLibraryStates.tsx` (`aria-hidden` skeleton; no string in `src/ui/copy`) |
| Page load failure | No user-visible message until copy is defined | `EXERCISE_LIBRARY_DETAIL_ERROR_MESSAGE` in `src/ui/copy/exercise-library-states.ts` (currently `undefined`, empty slot) |
| Region catalog load failure | No picker-specific copy today | Parent screen detail error slot; no dedicated region-list string |
| Invalid or over-length region input | No field-level copy today | `body_regions.label` in migrations: `NOT NULL UNIQUE` only; no max-length CHECK; no message in `src/ui/copy` |
| Save failure (exercise) | No exercise-editor save-failure strings today | `SAVE` / `CANCEL` only in `src/ui/copy/exercise-requests.ts` |
| Save failure (analogous routine draft) | Publish validation when rules fail | `VALIDATION_ADD_ROUTINE_NAME`, `VALIDATION_ADD_EXERCISE`, etc. in `src/ui/copy/routines.ts`; no body region issue type |

### Open: needs Diadem approval

- User-visible copy if the region catalog fails to load inside an otherwise loaded exercise form (described need only; no proposed wording).
- User-visible copy for invalid or duplicate region name on add (described need only; no proposed wording).
- User-visible copy for exercise save failure attributable to body region (described need only; no proposed wording).

### Open: needs Diadem decision

- [DIDI-1256](https://linear.app/didi-build/issue/DIDI-1256): Adding a new region while editing an existing exercise (Edit for everyone / Edit my copy).
- [DIDI-1256](https://linear.app/didi-build/issue/DIDI-1256): Placement for **Keep** and **Change** when AI suggests regions (strings approved; not rendered).

## Strings

### APPROVED (Diadem, Nov 18, 2026, ET)

| Id | String | When approved |
| -- | -- | -- |
| N1 | Add {region} | 3:14 PM (variant A) |
| N2 | Keep | 3:14 PM; placement open DIDI-1256 |
| N3 | Change | 3:14 PM; placement open DIDI-1256 |
| N4 | Type to search or add a region | 5:49 PM (placeholder) |

### Reused existing strings (verified in repo)

| String | Exact text | Source |
| -- | -- | -- |
| Body region | `Body region` | `src/ui/copy/exercise-library.ts` line 16 (`BODY_REGION`) |
| New | `New` | `src/ui/copy/exercise-library.ts` line 49 (`TAG_NEW`) |
| Clear | `Clear` | `src/ui/copy/exercise-library.ts` line 12 (`CLEAR`); visible chip remove button (variant B) |

## Decisions

1. Multi-region: `body_regions: string[]`; chips reflect every selected region.
2. Variant B chip row plus variant A add row inside typeahead dropdown on add-new-exercise flows.
3. AI drafter: keep all returned regions as chips; no truncation to a single region.
4. Edit flows: existing regions only until DIDI-1256 (interim).
5. **Keep** / **Change**: approved strings only; not rendered until DIDI-1256.
6. Hint and focus caret approved in r4 (5:49 PM ET).
7. Touch targets at least 44 px on chips, list rows, add row, and typeahead.

## Mockups

Phone 390 by 844 px; desktop 1280 by 900 px. No preview chrome. Caret frozen visible in stills.

| State | Phone | Desktop |
| -- | -- | -- |
| 01 matches | [phone](mockups/01-matches-phone.png) | [desktop](mockups/01-matches-desktop.png) |
| 02 add row | [phone](mockups/02-add-row-phone.png) | [desktop](mockups/02-add-row-desktop.png) |
| 03 chips | [phone](mockups/03-chips-phone.png) | [desktop](mockups/03-chips-desktop.png) |
| 04 empty | [phone](mockups/04-empty-phone.png) | [desktop](mockups/04-empty-desktop.png) |

## Changes

- **Nov 18, 2026**: DIDI-1253 r4 (A+B typing hint) approved 5:49 PM ET; multi-region chips; N4 placeholder; mockups 01 to 04. CTO withdrew single-choice ruling. https://linear.app/didi-build/issue/DIDI-1253
- **Nov 18, 2026**: QA and interim CTO scope on edit and `body_regions` array. https://linear.app/didi-build/issue/DIDI-1253
- **Nov 18, 2026**: Variant A strings approved 3:14 PM ET; product direction lock 2:58 PM EST. https://linear.app/didi-build/issue/DIDI-1253