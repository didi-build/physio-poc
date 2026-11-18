# Body region picker (exercise form)

Area: app · Feature: body-region-picker

## Purpose

Replace the exercise form's free-text body region field (`design/reference/web-app/generated/draftData.ts` `TEXT_META` key `region`, label "Body region"; live draft review today is `src/ui/exercise-requests/DraftReviewPage.tsx`) with a combobox picker: choose an existing catalog region, or add a new region inline while saving the exercise. A new region is not managed on its own; it is stored with the exercise and becomes visible in filters and search only when that exercise goes live.

**Matches Product direction: yes.** Checked against DIDI-594 lock Nov 18, 2026, 2:58 PM EST and Diadem approval Nov 18, 2026, 3:14 PM EST on [DIDI-1253](https://linear.app/didi-build/issue/DIDI-1253).

## Where it appears

| Surface | Context |
| -- | -- |
| AI draft review | Basics section while reviewing an AI-drafted exercise |
| Edit for everyone | Shared library entry editor (exercise-library) |
| Edit my copy | Private exercise copy editor |
| New exercise paths | Any form that today shows the Body region text field from the approved template |

Filter pills on Exercises and Routines still list regions that already have live exercises; they are not a region admin UI.

## Design source (approved Nov 18, 2026, 3:14 PM EST)

| Component | MagicPath link | Final revision |
| -- | -- | -- |
| Variant A, Inline Add row | https://designs.magicpath.ai/v1/friendly-pond-1383 | 473895725248430081 |

Diadem, Nov 18, 2026, 3:14 PM EST (locked on DIDI-594), verbatim: "variant A. i approve the strings"

Ignore the MagicPath preview state switcher ("Preview", tab labels, and notes under it). That chrome is not product UI.

## Locked Product direction (verbatim)

**DIDI-594**, Diadem, Nov 18, 2026, 2:58 PM EST:

> i think they are added when exercises are added. they dont need to add a new exercise independently. so a new body region goes live when it's corresponding exercise goes live

No standalone region management page. A new body region is saved with its exercise and goes live only when that exercise goes live.

## Layout (mobile first, 390 px)

Derived from MagicPath variant A `AInlineAddRow.tsx` (revision 473895725248430081).

- Form column `max-w-[390px]`, page padding `px-4 py-6`, background `#f8fafc`, body text `#0f172a`, Inter stack.
- Exercise title: `text-2xl font-semibold` (example content in the mockup only).
- Section heading **Basics**: `text-xs font-semibold uppercase tracking-[0.04em] text-[#64748b]`, `mt-6 mb-3`.
- Field label **Body region**: same uppercase label style, linked with `htmlFor` to the combobox input.
- Combobox input: full width, `min-h-11` (44 px touch target), `rounded-xl`, border `#cbd5e1`, focus border and ring `#0f766e`.
- Trailing chevron control inside the field: 32 px square (`h-8 w-8`), `min-h-11` row overall; toggles the list open or closed; `tabIndex={-1}` so keyboard focus stays on the input.
- Dropdown list: `absolute`, full width, `max-h-72`, `rounded-2xl`, border `#e2e8f0`, shadow; z-index above the form.
- List rows and the inline add row: `min-h-11` buttons, horizontal padding `px-3.5`, `text-sm font-semibold`.
- Existing row hover or keyboard highlight: teal wash `rgb(240 253 250 / 0.8)`.
- Inline add row: top border `#f1f5f9`, teal text `#115e59`, plus icon 16 px; highlight background `#f0fdfa`; trailing **New** pill (white background, `#115e59` text, `text-[11px]`).
- After a new or AI-backed selection (not an existing catalog pick): **New** tag below the field, `rounded-full`, background `#f0fdfa`, text `#115e59`, `text-[11px] font-semibold`.
- Selected existing option: teal check icon at the right of the row.

Region labels in the list and in the input display in sentence case (first character uppercase). Storage may stay lowercase in the API; display follows `src/ui/routines/body-region-display.ts` `capitalizeBodyRegionLabel`.

## Combobox behaviour

| Behaviour | Rule |
| -- | -- |
| Filtering | Existing regions whose names contain the typed query, case insensitive (`includes`). |
| Open | Open on input focus, on typing, and when the chevron is clicked. Close on pointer down outside the picker root, on Escape, and after a choice that commits selection. |
| Query while open | Typing updates the query, keeps the list open, resets keyboard highlight to the first option. |
| Sentence case on add | Typed add label uses `toSentenceCase`: trim, first character uppercase, remaining characters lowercase. |
| When add row shows | Query is non-empty after trim and sentence case, and does not exactly match an existing region (case insensitive). |
| When add row hides | Query empty, or exact match to an existing region. |
| Choose existing | Sets selection to that region, copies the name into the input, closes the list. |
| Choose add row | Sets selection to the sentence-cased name with kind `new` or `ai` (see AI state), copies into the input, closes the list. |
| Empty query | All existing regions appear in the list; no add row. |

## States

### 1. Existing match

The input shows a catalog region (example: "Hip"). The open list shows regions matching the query. The current selection row shows a teal check. Choosing another existing region updates selection and the input.

### 2. Typed new entry

The physio types a region that is not an exact catalog match (example: "Upper back"). The list shows any partial matches plus a final inline row: plus icon, **Add {region}** (example **Add Upper back**), and a **New** pill on that row. Choosing the row commits a pending new region for this exercise (kind `new`) and shows the **New** tag under the field until save.

See [mockup](mockups/02-typed-new-entry-phone.png).

### 3. AI-suggested new entry

The AI drafter prefills body region with a suggested value that is not an exact catalog match (concept demo: "Hamstrings"). The combobox shows that value; the list behaves like typed new (matches plus **Add {region}** when applicable).

Before the exercise is saved, the physio can:

- **Keep** (N2): accept the AI suggestion as the pending new region (selection kind `ai`, **New** tag visible).
- **Change** (N3): return to editing via the combobox (focus the input, list open) to pick an existing region or type a different new region.

Keep and Change use the approved N2 and N3 strings. Placement: inline with the **New** tag row under the field (same Basics block); both are `min-h-11` text or button targets.

### 4. Empty

Query is empty and there is no committed selection. The list shows every existing catalog region. There is no add row. The physio can type to filter or add, or pick from the list.

Clearing: deleting all text in the combobox reaches empty query. Reuse **Clear** (`src/ui/copy/exercise-library.ts` `CLEAR`) only where the wider exercise form already uses that control for fields; variant A does not add a separate clear button on the picker.

## Keyboard and accessibility

| Input | Behaviour |
| -- | -- |
| ArrowDown | Open if needed; move highlight to next option (clamped at last). |
| ArrowUp | Move highlight to previous option (clamped at first). |
| Enter | Activate the highlighted option (existing or add row). |
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
| N1 | Add {region} | Example: Add Upper back |
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

### Open: needs Diadem approval

None from variant A product UI. The preview switcher strings ("Preview", "Existing match", "Typed new", "AI suggested", "Empty", and `aria-label` "Preview states") are design chrome only and are not product copy.

## Decisions

1. Variant A inline add row: one list, no separate "create region" screen.
2. New regions are local to the exercise being saved; catalog filters gain the region only after that exercise is live.
3. AI suggestions use the same combobox and add row; Keep and Change are the explicit confirm or edit path before save.
4. Exact match to an existing region never shows the add row (prevents duplicate spellings).
5. Touch targets at least 44 px on the input, list rows, add row, chevron hit area, and Keep or Change actions.

## Mockups

| State | Phone (390 px) |
| -- | -- |
| 02 typed new entry | [phone](mockups/02-typed-new-entry-phone.png) |

Other states follow the rules above; additional PNGs can be added in a follow-up render pass.

## Changes

- **Nov 18, 2026**: DIDI-1253. Variant A approved by Diadem (3:14 PM EST). Product direction lock (2:58 PM EST). https://linear.app/didi-build/issue/DIDI-1253