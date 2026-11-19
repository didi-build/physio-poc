# Body region picker (exercise form)

Area: app · Feature: body-region-picker

## Purpose

When exercise save forms wire the approved template field (`design/reference/web-app/generated/draftData.ts` `TEXT_META` key `region`, label "Body region"), replace free text with a multi-select chip field plus typeahead: chosen regions render as chips; the physio types in a search field to pick existing catalog regions or, on add-new-exercise flows, add a region with the inline **Add {region}** row (variant A inside variant B). A new region is not managed on its own; it goes live when that exercise goes live.

**Today:** `src/ui/exercise-requests/DraftReviewPage.tsx` does **not** render a body region field. No exercise library editor in `src/ui/exercise-library/` renders a body region input today.

**Matches Product direction: yes.** Checked against [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) locks `6b4144fd` and `ef0be2a4`, Nov 18, 2026 product direction and approvals on [DIDI-1253](https://linear.app/didi-build/issue/DIDI-1253).

## Body region field in the app today

Only one screen in `src/ui` renders an editable **Body region** control:

| File | What it shows |
| -- | -- |
| `src/ui/routines/RoutineDraftEditorPage.tsx` | Label **Body region** (`src/ui/copy/routines.ts` `BODY_REGION`) with pill buttons from `listMeBodyRegions()` (`bodyRegionOptions` via `src/ui/routines/RoutineDraftEditorPage.tsx` line 171, `src/ui/api/routines-client.ts` lines 175 to 178), not this chip plus typeahead control |

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
| Variant B, Chips | https://designs.magicpath.ai/v1/eager-winter-5934 | 473894671903518720 | 473894671903518721 | Chip shell |
| r3 typing hint | https://designs.magicpath.ai/v1/safe-morning-6698 | 473931095931523072 | 473931652574371840 | Superseded by r4 |

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

Derived from MagicPath `ABR4TypingHint` (revision `473932751381368833`). Mobile first (390 px column `max-w-[390px]`). Desktop: same field block `lg:max-w-[40rem]`, centered on `#f8fafc`. Font: Inter.

### Label

**Body region**: `text-xs font-semibold uppercase tracking-[0.04em] text-[#64748b]`, `htmlFor` on the typeahead input id.

### Selected chips (variant B)

When `selections.length > 0`: `mt-2 flex flex-wrap items-center gap-2` below the label.

| Chip kind | Style |
| -- | -- |
| Existing catalog region | `rounded-full`, `border-[#0f766e]`, fill `#0f766e`, white text, semibold `text-sm`, `min-h-11` |
| New region (not in catalog or AI-new) | `rounded-full`, `border-[#0f766e]`, fill `#f0fdfa`, text `#115e59`, white pill **New** (`TAG_NEW`), `min-h-11` |
| Remove control | Visible text button **Clear** on each chip: `h-8`, `min-w-8`, `rounded-full`, `text-xs` font-semibold; `text-white/90` with `hover:bg-white/15` on existing chips, `text-[#115e59]` with `hover:bg-white` on New chips (`CLEAR`, `src/ui/copy/exercise-library.ts` line 12) |

### Typeahead field

`relative mt-2`, full width.

- Container: `flex min-h-11`, `rounded-xl`, white background, border `#cbd5e1`; when focused `#0f766e` border and `ring-2 ring-[#0f766e]/30`.
- Left: search icon `#94a3b8`, decorative (`aria-hidden`).
- Visible text layer: typed query in `#0f172a`; focused **|** caret `#0f766e` (class `abr4-caret`, blink `1s` `steps(1, end)`; mockups use frozen `abr4-caret-static`); placeholder **Type to search or add a region** in `#94a3b8` when query is empty (shown with caret when focused and empty).
- Transparent `<input>` overlay: `role="combobox"`, `caret-transparent`, `pl-10 pr-10`, captures typing and focus.
- Right: chevron button `tabIndex={-1}`, `aria-label` **Body region** (`BODY_REGION`), toggles list and refocuses input.
- Placeholder string: N4 **Type to search or add a region**.

### Dropdown list

`absolute left-0 top-full`, full width, `max-h-96`, `overflow-auto`, `rounded-2xl`, border `#e2e8f0`, shadow `0 12px 32px rgb(15 23 42 / 0.12)`, `z-20`, `py-1`. Shown when open and `options.length > 0`.

- Catalog rows: `min-h-11`, `px-3.5`, semibold `text-sm` `#0f172a`. Active keyboard/hover row: `bg-[rgb(240_253_250_/_0.8)]`. Inactive row hover: `bg-[#f8fafc]`.
- Filter: case-insensitive substring (`includes` on lowercased strings); exclude regions already on chips (`isSelected` via `sameRegion`).
- Add row (add-new-exercise flows only): when `filtered.length === 0` and normalized typed name is non-empty, not selected, and not an exact catalog match (`isExactExisting`). Optional `border-t border-[#f1f5f9]` when catalog rows exist above. Plus icon, **Add {region}** `#115e59`; active or hover `bg-[#f0fdfa]`; trailing **New** pill.

### After a pick

Choosing a list row or the add row: append chip (existing or new styling), clear typeahead text, close list, **keep focus** in the typeahead so another region can be added. **Clear** on a chip removes that chip only.

## Region labels: display and matching

**Display:** `capitalizeBodyRegionLabel` in `src/ui/routines/body-region-display.ts` (same as r4): first character uppercased, rest unchanged. Examples: `knee` to `Knee`, `ACL` stays `ACL`. Use on chips, list rows, and **Add {region}** (`typedName = capitalizeBodyRegionLabel(query.trim())`).

**Matching (r4 `sameRegion`):** `a.trim().toLowerCase() === b.trim().toLowerCase()` for duplicate checks (`isSelected`), catalog exact match (`isExactExisting`), and add-row eligibility. Substring filter uses `matchesRegion` (case-insensitive `includes`).

**Storage:** `body_regions: string[]` on the exercise. Seeded catalog labels in the database are lowercase (for example `knee` in `migrations/0001_exercise_data_model.sql`). Column `body_regions.label` is `TEXT NOT NULL UNIQUE` (case-sensitive uniqueness in SQLite). How new region labels are normalized when persisted is for the build ticket and CTO, not locked in this design spec.

## Combobox behaviour

| Behaviour | Rule |
| -- | -- |
| `canAdd` | `typedName.length > 0` and `filtered.length === 0` and not `isSelected(typedName)` and not `isExactExisting(typedName)` (add-new-exercise flows only) |
| After pick | `addSelection`: append chip, clear query, close list, `requestAnimationFrame` refocus input |
| Remove chip | Filter selections with `sameRegion`; refocus input |
| Chevron | Toggles `open`; does not steal focus from typeahead long term |

## States (mockups)

| # | State | What it shows |
| -- | -- | -- |
| 01 | Matches | Typeahead `ne`; list shows **Knee** (highlighted) and **Neck** |
| 02 | Add row | Typeahead `Quads` (from typed `quads`); list shows only **Add Quads** with **New** pill |
| 03 | Chips | **Glutes** existing chip plus **Quads** new chip; typeahead empty, unfocused, placeholder visible |
| 04 | Empty | Typeahead focused, caret visible, placeholder visible, full catalog list: Knee, Hip, Ankle, Shoulder, Lower back, Neck, Glutes |

On add-new-exercise flows, state 02 and new chips apply. On edit flows (interim), state 02 and new chips do not apply until DIDI-1256 decides.

### AI-drafted regions

All AI-returned regions arrive as pre-filled chips. Catalog matches use existing chip styling; drafter-only names use **New** chips. Strings **Keep** (N2) and **Change** (N3) are approved but **not rendered** until placement is decided.

**Open: needs Diadem decision ([DIDI-1256](https://linear.app/didi-build/issue/DIDI-1256)):** UI placement for **Keep** and **Change**.

## Keyboard and accessibility

| Input | Behaviour |
| -- | -- |
| ArrowDown | `preventDefault`; set `open` true; move highlight down (clamped). |
| ArrowUp | `preventDefault`; move highlight up (clamped). |
| Enter | `preventDefault`; `activateOption(highlight)` for the highlighted catalog row or add row **whether or not the list is open** (r4: Enter does not gate on `open`). |
| Escape | Close list (`setOpen(false)`). |

- Typeahead input: `role="combobox"`, `aria-expanded`, `aria-controls` (list id), `aria-autocomplete="list"`, `aria-activedescendant` when open and a highlighted option exists.
- List: `role="listbox"`, `aria-label` **Body region** (`BODY_REGION`).
- Options: `role="option"`, `aria-selected` when applicable; add row `aria-selected={false}`.
- Chevron: `aria-label` **Body region** (`BODY_REGION`), `tabIndex={-1}`.
- Chip remove: visible text **Clear** only (no region name in the control label).
- Icons: `aria-hidden`.

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
- Each chip remove control exposes only **Clear** to assistive tech, so screen reader users cannot tell which region they are removing. Accessible names that distinguish chips need new copy from Diadem (described need only; no proposed wording).

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

- **Nov 18, 2026**: DIDI-1253 QA R2: mockups from r4 source `473932751381368833`; `max-h-96`; display vs storage casing; `listMeBodyRegions`; a11y open item for chip **Clear**. https://linear.app/didi-build/issue/DIDI-1253
- **Nov 18, 2026**: DIDI-1253 r4 (A+B typing hint) approved 5:49 PM ET; multi-region chips; N4 placeholder; mockups 01 to 04. CTO withdrew single-choice ruling. https://linear.app/didi-build/issue/DIDI-1253
- **Nov 18, 2026**: QA and interim CTO scope on edit and `body_regions` array. https://linear.app/didi-build/issue/DIDI-1253
- **Nov 18, 2026**: Variant A strings approved 3:14 PM ET; product direction lock 2:58 PM EST. https://linear.app/didi-build/issue/DIDI-1253