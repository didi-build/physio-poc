# Routine conditions (New routine authoring)

Area: app · Feature: routine-conditions

## Purpose

On **New routine** and **Edit draft** (`RoutineDraftEditorPage`), practitioners pick one or more shared conditions before publish, using the same chips-plus-typeahead pattern as the [body region picker](../body-region-picker/spec.md). They can add a condition that goes live for every practitioner immediately, rename any condition, or delete any condition (with confirm, no Undo). **Body region** on the form is read-only chips derived from the routine's exercises, not a picker.

Library cards, filters, and search updates live in [routines/spec.md](../routines/spec.md) (is/was there). [Similar routine warning](../similar-routine-warning/spec.md) defers the condition control here per DIDI-594 `3fd723a4`.

**Today:** `src/ui/routines/RoutineDraftEditorPage.tsx` uses a single-select pill list when the seeded condition catalog is non-empty; label `CONDITION` (`src/ui/copy/routines.ts`); **Body region** is editable pills from `listMeBodyRegions()`.

**Matches Product direction: yes.** Checked against [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) entry J and J update 1 (`41b3b0d0`), J update 2 (`28eea987`), J update 3 layout A (`03489a7e`), condition label and picker pattern (`3fd723a4`), approved strings (`6d77e60d`), standing rule and Designer picks (`a887af34`), and body region picker locks reused by reference.

**Blocks:** [DIDI-1219](https://linear.app/didi-build/issue/DIDI-1219) (authoring UI). Unblocks similar-routine form completeness for [DIDI-1226](https://linear.app/didi-build/issue/DIDI-1226) once DIDI-1219 ships.

## Design source (approved)

| Choice | MagicPath link | Component id | Revision | Status |
| -- | -- | -- | -- | -- |
| Option A, inline condition field | https://designs.magicpath.ai/v1/solid-shade-6702 | 471087964336840704 | 474549354716364800 | Layout locked Nov 11 (`03489a7e`); strings Nov 21 (`6d77e60d`) |

Project `471087931147292672`. Mobile first (390 px column). Desktop: same field block at 1280 px, centered on `#f8fafc`, matching New routine shell in [similar-routine-warning](../similar-routine-warning/spec.md).

## Locked Product direction (verbatim)

**DIDI-594**, Diadem, Nov 10, 2026, 8:41 PM EST (entry J update 1, `41b3b0d0`, verbatim):

> yes, we can have one routine that serves multiple conditions ie, sciatica, a weak core, lower back pain, etc. all can be treated with similar exercises

> body parts come from the exercises within the routine

**DIDI-594**, Diadem, Nov 10, 2026, 9:01 PM EST (J update 2, `28eea987`, verbatim answers on DIDI-1221):

- "Everyone sees a new condition right away"
- "Suggest existing matching conditions while typing"
- "Anyone can edit or delete any condition"
- "Show no body part for that routine"

**DIDI-594**, Diadem, Nov 11, 2026, 7:10 PM EST (`03489a7e`, verbatim relayed by CTO): **"1216: A"** (inline condition field on New routine).

**DIDI-594**, Diadem, Nov 19, 2026, 4:27 PM ET (`3fd723a4`, verbatim): **"yes to "conditions" but I noticed there's no way to add more? we should add that and it should follow the UI/UX for adding regions to an exercise"**

**DIDI-1254**, CTO, Nov 19, 2026 (comment `34ddfb6e`, verbatim ruling on body region picker chip **Clear**):

> Ruling on the spec's open item (accessible names for each accepted chip's Clear): use the already-approved `Clear {region}` (32f06097). Each name includes the region, so every chip's Clear is distinct. Don't add any other new strings.

**Is (conditions):** same pattern with **Clear {condition}** (W7). **Was:** similar-routine exploration used **Remove {condition}** (`f4682350`).

## Standing rule and Designer picks (not Diadem's words)

**DIDI-594** comment `a887af34`, Diadem, Nov 21, 2026, 12:58 AM EST (CTO lock of Diadem's words, relayed by Designer):

> going forward please pick something reasonable. only ask me if it's a true product decision that you are unsure about

| Designer pick (DIDI-594 `a887af34`) | Rule |
| -- | -- |
| Q16 | Selected condition chips keep visible **Clear**; accessible name **Clear {condition}** (W7; same pattern as body region picker **Clear {region}**, per [DIDI-1254](https://linear.app/didi-build/issue/DIDI-1254) CTO comment `34ddfb6e` and lock `32f06097`) |
| Q17 | **Rename** and **Delete** use confirm only; no Undo after confirm |
| Q18 | Renaming to a name that already exists is **blocked**, not merged |
| Q19 | Library search hints mention conditions; placeholder **Try: sciatica, knee, low back** ([DIDI-1216](https://linear.app/didi-build/issue/DIDI-1216) `d0366ea0`; see [routines spec](../routines/spec.md) search is/was) |

**Designer picks** recorded on [DIDI-1216](https://linear.app/didi-build/issue/DIDI-1216) comment `b5ce6ede` (under Diadem's `a887af34` standing rule; not Diadem's words):

| Pick | String or behaviour |
| -- | -- |
| Q18 elaboration | Inline C19 **A condition with this name already exists.**; **Save** stays disabled until the name is unique |
| Q20 | No toast after rename or delete; catalog and chips update in place |
| Q21 | Rename sheet primary reuses **Save** (`src/ui/copy/exercise-requests.ts` `SAVE`) |

True product decisions (recipients, counts, who sees what, data behaviour) stay escalated to Diadem. The spec does not pick them; open items are listed under **Open: product / data behaviour** below.

## Pattern reuse (body region picker)

Reuse layout, combobox behaviour, chip styling, add row, and keyboard rules from [body-region-picker/spec.md](../body-region-picker/spec.md) with these substitutions:

| Body region | Conditions |
| -- | -- |
| Label **Body region** | Label **Conditions** (W8, `3fd723a4`) |
| Placeholder N4 | **Type to search or add a condition** (C2) |
| Add row N1 | **Add {condition}** (C3); `{condition}` = display form of typed text (same casing rules as region picker `capitalizeBodyRegionLabel`) |
| Helper under field (none on region exercise form) | **Pick one or more. A condition you add is there for every practitioner right away.** (C4) |
| Empty catalog row | **No conditions yet. Type one to add the first.** (C5) |
| **New** pill on add row and user-new accepted chips | Same **New** (`TAG_NEW`) |
| Accepted chip remove | Visible **Clear** (`CLEAR`); `aria-label` **Clear {condition}** (W7; **Designer pick** `a887af34` Q16; pattern ruled [DIDI-1254](https://linear.app/didi-build/issue/DIDI-1254) comment `34ddfb6e`: use approved **Clear {region}** with the entity name in the accessible label) |
| No pending AI chips | Not used on conditions |
| Goes live | When the condition is created (globally visible at once per J update 2), not gated on routine publish |

### Differences from body region picker

| Topic | Conditions rule |
| -- | -- |
| Where the control appears | New routine and Edit draft only in this spec; rename/delete also from overflow on catalog rows (below) |
| Overflow on list rows | Each catalog match row shows a **...** control; menu items **Rename** (C12) and **Delete** (C13). Visible labels only; control `aria-label` **More for {name}** (C18) |
| Body region on same form | Read-only chip row; helper **Comes from the exercises in this routine.** (C7). No picker |
| Publish validation | At least one condition required (C6, C8) |
| Card/list overflow | When a routine has more than two conditions on a card, show two condition chips plus **+{n}** (C9) for the rest (`n` = hidden count) |

## Layout (option A)

From MagicPath revision `474549354716364800` and region-picker tokens.

| Element | Rule |
| -- | -- |
| Section order on New routine | **Conditions** first, then **Routine name**, **Who it's for (optional)**, **Body region** (derived), **Exercises** |
| Label **Conditions** | `text-xs font-semibold uppercase tracking-[0.04em] text-[#64748b]`, `htmlFor` on combobox input |
| Chips | Same accepted-catalog styling as body region picker: `rounded-full`, fill `#0f766e`, white semibold text, `min-h-11`, visible **Clear** |
| Typeahead | Same shell as body region picker (search icon, chevron, `max-h-96` list, case-insensitive filter, exclude selected) |
| Add row | When `filtered.length === 0` and normalized typed name is non-empty, not selected, and not an exact catalog match |
| List row menu | Trailing icon button **...**; opens **Rename** / **Delete** actions |
| Derived **Body region** | Outlined slate chips (read-only); hidden section subtitle when zero regions (no placeholder region) |

## Rename flow

| Step | UI |
| -- | -- |
| Open | Overflow **Rename** on a catalog row, or equivalent entry on routine detail badges (same strings; placement on detail is build scope of DIDI-1219) |
| Sheet title | **Rename condition** (C14) |
| Field label | **Condition name** (C15) |
| Helper | **The new name shows on every routine that uses it, for every practitioner.** (C16) |
| Primary | **Save** (`SAVE`, **Designer pick** [DIDI-1216](https://linear.app/didi-build/issue/DIDI-1216) `b5ce6ede` Q21). Saves on confirm; no Undo (`a887af34` Q17) |
| Blocked duplicate name | Inline under the field: C19 (**Designer pick** `b5ce6ede` Q18 elaboration). **Save** disabled until unique |

## Delete flow

| Step | UI |
| -- | -- |
| Open | Overflow **Delete** |
| Title | **Delete {name}?** (C17) |
| Body | **{n} routines use it. It comes off all of them, for every practitioner.** (C10) |
| Destructive confirm | **Delete condition** (C11) |
| After confirm | Condition removed globally; no Undo (`a887af34` Q17). No success toast; catalog and chips update in place (**Designer pick** `b5ce6ede` Q20) |

**Out of scope (DIDI-1262):** deleting a condition that is a routine's **only** condition. Do not spec that outcome here.

## Publish validation

When publish is attempted without at least one condition:

| Element | Copy |
| -- | -- |
| Summary box | Existing **Before you publish** (`BEFORE_YOU_PUBLISH`); new bullet **Add at least one condition** (C6) alongside existing name and exercise bullets |
| Footer | **Your draft is still saved.** (existing) |
| Inline under **Conditions** | **Add a condition to publish.** (C8) |

## States (mockups)

Phone 390 px (height varies by state; padded to 844 px in PNGs). Desktop 1280 by 900 px. Single-state frames from MagicPath revision `474549354716364800`, variant A `CfBoard` (Playwright `#root` capture). No board titles, next-state fragments, or amber **New** markers.

| # | State | What it shows |
| -- | -- | -- |
| 01 | matches | Typeahead `sci`; list **Sciatica** with overflow **...** |
| 02 | add row | Typeahead `piriformis`; **Add Piriformis** with **New** pill |
| 03 | chips multi | Three selected chips; empty typeahead; helper C4; derived **Hip** and **Lower back** |
| 04 | empty catalog | Focused typeahead; list message C5 |
| 05 | publish validation | **Before you publish** summary with C6; inline C8; existing name and exercise bullets |
| 06 | name exists | Typeahead matches an existing condition; no **Add** row (pick the match) |
| 07 | overflow menu | Routine page badge overflow open (**Rename**, **Delete**); same menu pattern on typeahead catalog rows |
| 08 | rename sheet | **Rename condition**, **Condition name**, helper C16, primary **Save** |
| 09 | rename blocked | C19 duplicate name error; **Save** disabled (**Designer pick** `b5ce6ede`) |
| 10 | delete confirm | C17, C10, C11 |

| State | Phone | Desktop |
| -- | -- | -- |
| 01 matches | [phone](mockups/01-matches-phone.png) | [desktop](mockups/01-matches-desktop.png) |
| 02 add row | [phone](mockups/02-add-row-phone.png) | [desktop](mockups/02-add-row-desktop.png) |
| 03 chips multi | [phone](mockups/03-chips-multi-phone.png) | [desktop](mockups/03-chips-multi-desktop.png) |
| 04 empty catalog | [phone](mockups/04-empty-phone.png) | [desktop](mockups/04-empty-desktop.png) |
| 05 publish validation | [phone](mockups/05-validation-phone.png) | [desktop](mockups/05-validation-desktop.png) |
| 06 name exists | [phone](mockups/06-name-exists-phone.png) | [desktop](mockups/06-name-exists-desktop.png) |
| 07 overflow menu | [phone](mockups/07-overflow-menu-phone.png) | [desktop](mockups/07-overflow-menu-desktop.png) |
| 08 rename sheet | [phone](mockups/08-rename-phone.png) | [desktop](mockups/08-rename-desktop.png) |
| 09 rename blocked | [phone](mockups/09-rename-blocked-phone.png) | [desktop](mockups/09-rename-blocked-desktop.png) |
| 10 delete confirm | [phone](mockups/10-delete-confirm-phone.png) | [desktop](mockups/10-delete-confirm-desktop.png) |

## Keyboard and accessibility

Same as [body-region-picker/spec.md](../body-region-picker/spec.md) Keyboard and accessibility, except:

| Element | Markup |
| -- | -- |
| Combobox `aria-label` / list label | **Conditions** (W8) |
| Chevron `aria-label` | **Conditions** (W8) |
| Accepted chip remove | Visible **Clear**; `aria-label` **Clear {condition}** (W7) |
| Overflow **...** | `aria-label` **More for {name}** (C18); visible icon only |
| **Rename** / **Delete** menuitems | Visible text C12, C13 |

## Copy and accessibility table

| Id | String | Role | Accessibility notes |
| -- | -- | -- | -- |
| W8 | Conditions | Section label, combobox list label | `htmlFor` on input; chevron `aria-label` |
| C2 | Type to search or add a condition | Typeahead placeholder | Visible |
| C3 | Add {condition} | Add row | `{condition}` in visible text |
| C4 | Pick one or more. A condition you add is there for every practitioner right away. | Field helper | Visible paragraph under control |
| C5 | No conditions yet. Type one to add the first. | Empty catalog | Visible list message |
| C6 | Add at least one condition | Publish summary bullet | Inside `role="alert"` summary with other bullets |
| C7 | Comes from the exercises in this routine. | Body region helper | Visible; region chips `aria-readonly` |
| C8 | Add a condition to publish. | Inline validation | Associated with **Conditions** via `aria-describedby` when shown |
| C9 | +{n} | Card overflow count | Visible; `n` hidden condition count |
| C10 | {n} routines use it. It comes off all of them, for every practitioner. | Delete confirm body | `{n}` count source **Open** ([DIDI-1272](https://linear.app/didi-build/issue/DIDI-1272)) |
| C11 | Delete condition | Delete confirm primary | Destructive button |
| C12 | Rename | Menu item | Visible |
| C13 | Delete | Menu item | Visible |
| C14 | Rename condition | Rename sheet title | `h2` / dialog label |
| C15 | Condition name | Rename field label | `htmlFor` on input |
| C16 | The new name shows on every routine that uses it, for every practitioner. | Rename helper | Visible |
| C17 | Delete {name}? | Delete sheet title | `{name}` condition display name |
| C18 | More for {name} | Overflow control | Accessible name only |
| C19 | A condition with this name already exists. | Rename blocked duplicate | Visible inline; `aria-describedby` on **Condition name** field (**Designer pick** DIDI-1216 `b5ce6ede`, Q18 elaboration) |
| W7 | Clear {condition} | Chip remove | Visible **Clear** (`CLEAR`); `aria-label` only (**Designer pick** `a887af34` Q16; pattern [DIDI-1254](https://linear.app/didi-build/issue/DIDI-1254) `34ddfb6e`) |
| (reuse) | Clear | Chip remove visible | `src/ui/copy/exercise-library.ts` `CLEAR` |
| (reuse) | Save | Rename sheet primary | `src/ui/copy/exercise-requests.ts` `SAVE` (**Designer pick** DIDI-1216 `b5ce6ede` Q21) |
| (reuse) | Cancel | Rename and delete sheet secondary | Existing approved **Cancel** ([DIDI-1216](https://linear.app/didi-build/issue/DIDI-1216) `d0366ea0`) |
| (reuse) | New | Add row / user-new chip | `TAG_NEW` |
| (reuse) | Before you publish | Validation summary title | `BEFORE_YOU_PUBLISH` |
| (reuse) | Your draft is still saved. | Validation footer | routines copy inventory |

### Approved (Diadem, Nov 21, 2026, 12:46 AM EST, DIDI-594 `6d77e60d`)

Diadem's reply to items 4 to 15, verbatim: **approve** (strings exactly as listed in lock).

### Open: product / data behaviour (escalate; do not implement from this spec)

| Topic | Why open |
| -- | -- |
| Deleting a routine's only condition | **Open:** [DIDI-1262](https://linear.app/didi-build/issue/DIDI-1262). Direction locked on [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) `0cc3e785` (flag; cancel or replace the condition). Strings and UI on DIDI-1262; out of scope here |
| Normalised duplicate handling on **create** vs **rename** | **Open:** merged on create per [DIDI-1218](https://linear.app/didi-build/issue/DIDI-1218) and J update 2 (`28eea987`). Rename blocked, not merged (`a887af34` Q18) |
| Delete confirm routine count (`{n}` in C10) | **Open:** [DIDI-1272](https://linear.app/didi-build/issue/DIDI-1272) (ready for maintainer). Do not invent |

## Is/was (this feature)

| Topic | Was (v12 / PR137 exploration) | Is (this spec) |
| -- | -- | -- |
| Form label | **Condition** (`CONDITION`) | **Conditions** (W8, `3fd723a4`) |
| Condition control | Single-select pills when catalog non-empty | Multi-select typeahead + chips (`3fd723a4`, body region pattern) |
| Add conditions | Not on form in similar-routine mockups | Typeahead + **Add {condition}** row |
| Chip remove a11y | **Remove {condition}** in similar-routine exploration (`f4682350`) | Visible **Clear**, **Clear {condition}** (W7, `a887af34` Q16) |
| Body region on draft form | Editable pills (`listMeBodyRegions`) | Read-only chips from exercises (J update 1) |
| Publish validation bullets | Name and exercise only | Adds **Add at least one condition** (C6) |
| Condition rename/delete | Not in v12 | Overflow **Rename** / **Delete** with confirms (`6d77e60d`, `a887af34` Q17) |
| Layout | Open | Option A inline field (`03489a7e`) |

## Decisions

1. Conditions required to publish; many allowed (J update 1).
2. Reuse body region picker interaction model (`3fd723a4`).
3. Option A inline field (`03489a7e`).
4. Global visibility and practitioner add with no review (J update 2).
5. Rename/delete: confirm only, no Undo (`a887af34` Q17).
6. Rename collision: block, not merged (`a887af34` Q18); C19 and disabled **Save** (`b5ce6ede`).
7. W7 chip remove: visible **Clear**, **Clear {condition}** (`a887af34` Q16; pattern DIDI-1254 `34ddfb6e`).
8. Rename primary **Save** (DIDI-1216 `b5ce6ede` Q21).
9. After rename/delete: no toast (DIDI-1216 `b5ce6ede` Q20).
10. Only condition delete blocking for sole condition stays on DIDI-1262.

## Changes

- **Nov 21, 2026**: DIDI-1216 QA R1 (physio-poc#145). Mockups 01 to 10 recaptured as single-state 390 and 1280 frames; open rows point at DIDI-1218, DIDI-1262, DIDI-1272; J update 1 verbatim; `d0366ea0` for **Cancel** reuse; `a887af34` relay wording.
- **Nov 21, 2026**: DIDI-1216 QA. Citation split: `a887af34` Q16 to Q19 vs elaborations on `b5ce6ede` (C19, Q20, Q21).
- **Nov 21, 2026**: DIDI-1216 follow-up. Designer picks; DIDI-1254 `34ddfb6e` for W7; mockups 06 to 08 from CfBoard captures.
- **Nov 21, 2026**: DIDI-1216. Option A spec, approved strings (`6d77e60d`), Designer picks (`a887af34`), mockups 01 to 05 from MagicPath `474549354716364800`. Blocks DIDI-1219; unblocks DIDI-1226 path with DIDI-1219. https://linear.app/didi-build/issue/DIDI-1216