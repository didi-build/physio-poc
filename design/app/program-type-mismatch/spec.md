# Program builder: type-mismatch placeholder row (variant B)

Area: app · Feature: program-type-mismatch

## Purpose

When another practitioner approves an exercise request, `linkApprovedPlaceholders` links every placeholder row whose row type fits the approved exercise category. Rows whose type does not fit stay placeholders; the row type is not reset and approval still succeeds (CTO ruling on [DIDI-1005](https://linear.app/didi-build/issue/DIDI-1005), Oct 30, 2026). This spec decides how the program owner sees those skipped rows in the **Build program** builder and on the **Programs** list, and how they fix them. Variant **B**: a builder banner with **Show me**, plus a compact skipped row with an inline **Fix** expansion.

Mobile first (390 px). The same states work at 1280 px on the approved programs builder layout ([programs/spec.md](../programs/spec.md)).

**Matches Product direction: yes.** Checked against the live [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) description and locked comments quoted below, [DIDI-1005](https://linear.app/didi-build/issue/DIDI-1005) (skip rule unchanged), [DIDI-1186](https://linear.app/didi-build/issue/DIDI-1186) / publish block (Nov 8, 2026), DIDI-1105 Diadem approvals (Nov 21, 2026), and DIDI-1106 comment `56b379c5` (`placeholder_state`).

## Design source (approved Nov 21, 2026)

| Choice | MagicPath link | Component id | Revision |
| -- | -- | -- | -- |
| B. Builder banner plus compact row | https://designs.magicpath.ai/v1/brightly-cloud-4843 | 466879152478384128 | 466879152478384129 |

MagicPath project: 466877433694535680 (DIDI-1105 exploration boards). Baseline and options A and C are retired; option B is final.

**Diadem, Nov 21, 2026, 12:49 AM EST** (Designer chat, verbatim): `didn't link option B . loading error option C`.

**Diadem, Nov 21, 2026, 12:53 AM EST** (verbatim reply to option B strings and Q22 to Q23): `approved, yes, yes`.

**Diadem, Nov 21, 2026, 12:57 AM EST** (verbatim, card flag and banner plural): `yes this is a proof of concept, we don't need to be too stingy with the wording` (scoped to the card flag and singular or plural builder banner copy listed in the Locks section below, not a blanket grant of new strings).

### CTO locks (DIDI-594)

| Comment | Locks |
| -- | -- |
| `2bdbb75b` | Option **B** (brightly-cloud-4843) for DIDI-1105 skipped placeholder notification |
| `7e4a9711` | Strings T1 to T13, Q22 (keep sets and reps), Q23 (Programs card shows a flag); banner second line dropped |
| `c8a1509f` | Programs card flag and builder banner: **T5**, **T6**, **T14**, **T15** |

### Standing rule (DIDI-594 comment `a887af34`)

**Diadem, Nov 21, 2026, 12:58 AM EST** (Designer's chat, relayed on `a887af34`), verbatim:

> going forward please pick something reasonable. only ask me if it's a true product decision that you are unsure about

### Designer picks (DIDI-1105 comment `b650a678`)

Recorded under the standing rule above. Not Diadem's verbatim words.

| Topic | Designer pick (`b650a678`) |
| -- | -- |
| Publish sheet `type_mismatch` rows | Same row layout as other blocked placeholders in [DIDI-1186](../programs/spec.md#publish-blocked-by-placeholders-didi-1186): exercise name, approved badge **Didn't link**, row link action **Fix** (replaces **Review draft**), Remove icon. **Fix** closes the sheet and moves focus to that row in the builder with its **Fix** panel open (`aria-expanded="true"`). Mixed lists show both placeholder kinds in builder order. DIDI-1186 notice heading, focus order and removal read-out stay unchanged. |
| Reverse mismatch reason (**T16**) | **Approved as stretching. Change the type to link it.** Mirrors approved **T3** |
| Type choice accessible name | Link {exercise} as {type} |
| **Show me** accessible name | Show me exercises that didn't link |

### Designer picks (DIDI-1105 comment `a3f73814`)

Recorded under the standing rule above. Not Diadem's verbatim words. No behaviour change: publish stays blocked while any placeholder or didn't-link row remains (DIDI-1186).

| Topic | Designer pick (`a3f73814`) |
| -- | -- |
| Publish notice body, mixed list | Keep the approved DIDI-1186 notice body, then add second sentence **T18** |
| Publish notice body, every row `type_mismatch` | Body is **T19** only (no approved draft-approval sentence) |
| Publish sheet **Fix** accessible name | Fix for {name} (visible label **Fix**, **T4**) |

## API signal (DIDI-1106, not designed here)

Per DIDI-1106 comment `56b379c5` (CTO, Oct 30, 2026, 7:35 AM ET), `getProgram` returns `placeholder_state` on placeholder rows only, derived at read time:

| `placeholder_state` | Meaning |
| -- | -- |
| `awaiting_approval` | Request is drafting or open |
| `type_mismatch` | Request is approved but the row is still a placeholder because the row type did not fit the approved exercise |
| `request_closed` | Request is rejected or withdrawn |

Linked rows omit the field. Until this spec merged, `request_closed` had no UI (see Out of scope).

## States

| State | Where | What it shows |
| -- | -- | -- |
| Builder, no type mismatch | Build program | No banner. Placeholder rows with `awaiting_approval` keep today's **Pending review** row and note (unchanged). |
| Builder, one or more type mismatches | Build program | Amber banner (heading only, see copy table). **Show me** scrolls to the first skipped row and opens **Fix** (see Behaviour). Each `type_mismatch` row uses the skipped row pattern below, not **Pending review**. |
| Builder, skipped row (compact) | Row | Exercise name from the placeholder; orange **Didn't link** badge; **Row type: {type}** using the row's current prescription type label; reason line; **Fix**; duplicate and remove unchanged from v12. Dose box stays visible with the row's snapshotted values. |
| Builder, skipped row (Fix open) | Same row | **Fix** sets `aria-expanded="true"` and `aria-controls` the inline choice panel. Panel lists each allowed strengthening type (Isometric, Concentric, Eccentric) with its hint, or only **Stretching** with the existing stretch hint in the reverse case (see Reverse mismatch). **Pick another exercise** opens the existing **Add exercise** sheet to replace this row (same entry point as v12 **Add exercise**, scoped to this row). Choosing a type links the row to the approved version and shows the link toast. |
| Builder, after link | Row | Linked row (purple type line, dose box, cues as today). Toast **Linked {exercise} as {type}.** with **Undo**. |
| Programs list card | Programs | When the program has one or more `type_mismatch` placeholders, show an amber flag: **1 exercise didn't link** (one) or **{n} exercises didn't link** (more than one), same wording as the builder banner heading. Reuse the library-updates flag placement pattern on the card ([programs/spec.md](../programs/spec.md) States). |
| Publish | Publish sheet | A `type_mismatch` row is still a placeholder. **Publish now** stays disabled while any placeholder remains ([DIDI-1186](../programs/spec.md#publish-blocked-by-placeholders-didi-1186)). Rows with `type_mismatch` use badge **Didn't link**, link action **Fix**, and **Remove** (**Designer pick**, `b650a678`). Rows with `awaiting_approval` keep **Pending review** and **Review draft**. A mixed list follows builder order. |

## Behaviour

| Topic | Rule |
| -- | -- |
| Banner visibility | Shown when `placeholder_state === 'type_mismatch'` on at least one row. Heading uses singular or plural approved copy from the count. No secondary body line under the heading (dropped in lock `7e4a9711`; not a Designer pick). |
| **Show me** | Scrolls the first `type_mismatch` row into view (smooth), opens **Fix** on that row (`aria-expanded="true"`), and briefly highlights the row (implementation detail). If multiple rows mismatch, repeat visits cycle or target the first; exact multi-row banner behaviour beyond count copy is implementation choice as long as **Show me** reaches a mismatch row and opens **Fix**. |
| **Fix** | Toggles the inline type panel on that row only. Visible label stays **Fix** (approved). `aria-expanded` reflects open or closed. Do not ship an unapproved **Close** label (the MagicPath preview toggles to **Close**; that text is not approved). |
| Fix by type | Sets the row prescription type to the chosen type and links the approved exercise version to the row (same outcome as today's successful `linkApprovedPlaceholders` link). Fires the link toast. |
| **Undo** (toast) | Restores the skipped state: row unlinked, `placeholder_state` back to `type_mismatch`, type and doses as before the link attempt. |
| **Pick another exercise** | Opens the existing Add exercise sheet; replacing the row follows today's builder add and remove rules. |
| Preserve doses (Q22) | **Diadem, Nov 21, 2026, 12:53 AM EST**, verbatim scope: a fixed row **keeps its sets and reps** (and, by extension, the row's existing snapshotted dose fields that remain valid for the new type after link). |
| Incompatible fields | Stretching rows use hold and times per day; strengthening rows use sets and reps. When Fix changes type, the server already trims disallowed fields on link (`filterExerciseParamsForPrescriptionType`). **This spec does not choose** client-side resets beyond the Q22 lock: if UI shows a dose box before and after Fix, it must reflect server truth after link. Any ambiguous display when fields are dropped is an implementation note for [DIDI-1106](https://linear.app/didi-build/issue/DIDI-1106), not a new product decision here. |
| Ordinary placeholder | Rows with `awaiting_approval` are unchanged: **Pending review**, placeholder note, amber row styling. |
| `request_closed` | **Out of scope / unapproved UI.** Per DIDI-1106 comment `56b379c5`, render like `awaiting_approval` until a future spec covers it. No copy or layout for `request_closed` in this PR. |
| No patient information | Same as programs spec. No patient names in banner, row, toast, or flag. |
| Publish sheet **Fix** | For `type_mismatch` rows only (**Designer pick**, `b650a678`). Same slot and styling as **Review draft** on `awaiting_approval` rows. Closes the publish sheet and navigates to the builder with that row scrolled into view and **Fix** expanded. Remove unchanged. |
| Publish notice body | See [programs/spec.md](../programs/spec.md#publish-blocked-by-placeholders-didi-1186). **Awaiting only:** approved Nov 8 body unchanged. **Mixed** (`awaiting_approval` and `type_mismatch`): approved body plus **T18** (**Designer pick**, `a3f73814`). **Every row `type_mismatch`:** **T19** only (**Designer pick**, `a3f73814`). |

### Example (documented in mockups)

Strengthening exercise **Bridge marching** approved while the row type is **Stretching**: reason **Approved as strengthening. Change the type to link it.**, **Row type: Stretching**, Fix offers Isometric, Concentric, Eccentric.

### Reverse mismatch

Approved **stretching** exercise on an Isometric, Concentric, or Eccentric row: the only type choice is **Stretching**. Reuse the existing stretch type hint **Hold a stretch** (`design/reference/web-app/generated/programModel.ts` `TYPE_HINT.stretching`, same as `src/ui/copy/exercise-library.ts` `TYPE_STRETCH_HINT`). Reason line **Approved as stretching. Change the type to link it.** (**T16**, **Designer pick**, `b650a678`, mirrors **T3**).

## Layout and accessibility (variant B)

Derived from revision `466879152478384129` (`SkippedRowCore.tsx`, `PhysioShell.tsx`). Tokens align with [programs/spec.md](../programs/spec.md) builder rows (amber placeholder, orange mismatch accent).

| Element | Layout / a11y |
| -- | -- |
| Banner | `role="status"`, below program name, above the Exercises heading. Icon alert (v12 `I.alert`). **Show me** is a link-styled button, min height 44 px. Banner is polite status, not `role="alert"`. |
| Skipped row | Orange left border accent (distinct from amber **Pending review**). Badge **Didn't link** with alert icon. |
| **Row type: {type}** | Visible type label from `TYPE_LABELS` / `TYPE_LABEL` (Stretching, Isometric, Concentric, Eccentric). |
| **Fix** | `aria-expanded`, `aria-controls` on the inline panel id. Focus returns to **Fix** when the panel closes. |
| Type choices | Full-width buttons: type name (semibold) and hint (secondary). Minimum height 48 px touch. |
| Toast | `role="status"`, bottom of screen (shared layout [design/README.md](../../README.md)). **Undo** is a button in the toast. |
| Programs flag | Amber flag on the card, same visual weight as **1 library update to review** flags. Flag text is the banner heading string, not a new phrase. |
| 1280 px | Builder uses the approved `max-w-6xl` content column; banner and rows span the main column. Sticky publish card unchanged. |

## Strings and accessibility (final copy)

### Approved (Diadem, Nov 21, 2026)

| Id | Visible text | Accessibility / role | When approved |
| -- | -- | -- | -- |
| T1 | Didn't link | Badge on skipped row; row state exposed via name plus reason text | 12:53 AM EST |
| T2 | Row type: {type} | `{type}` is the visible prescription type label | 12:53 AM EST |
| T3 | Approved as strengthening. Change the type to link it. | Reason line (strengthening approved, stretching row example). `aria-describedby` from row title to reason for **Fix** context | 12:53 AM EST |
| T4 | Fix | Button visible label; `aria-expanded` | 12:53 AM EST |
| T5 | 1 exercise didn't link | Builder banner heading (count = 1) | 12:53 AM EST |
| T6 | {n} exercises didn't link | Builder banner heading (count > 1) | 12:57 AM EST (`c8a1509f` scope) |
| T7 | Show me | Banner action; scroll plus open **Fix** | 12:53 AM EST |
| T8 | Hold still under load | Hint under Isometric | 12:53 AM EST |
| T9 | Lift or push with control | Hint under Concentric | 12:53 AM EST |
| T10 | Lower slowly | Hint under Eccentric | 12:53 AM EST |
| T11 | Pick another exercise | Secondary action under type choices | 12:53 AM EST |
| T12 | Linked {exercise} as {type}. | Toast after successful link | 12:53 AM EST |
| T13 | Undo | Toast action; restores skipped state | 12:53 AM EST |
| T14 | 1 exercise didn't link | Programs list card flag (one) | 12:57 AM EST (`c8a1509f`, Q23) |
| T15 | {n} exercises didn't link | Programs list card flag (more than one) | 12:57 AM EST (`c8a1509f`) |
| T16 | Approved as stretching. Change the type to link it. | Reason line (stretching approved, strengthening row). **Designer pick** (`b650a678`) | Nov 21, 2026 |
| T17 | Fix | Publish sheet link action for `type_mismatch` rows (reuses builder **T4**). **Designer pick** (`b650a678`) | Nov 21, 2026 |
| T18 | Fix or remove the exercises that didn't link. | Second sentence on publish notice body when the list is mixed | **Designer pick** (`a3f73814`) |
| T19 | Fix or remove the exercises that didn't link, then publish. | Publish notice body when every placeholder row is `type_mismatch` | **Designer pick** (`a3f73814`) |

Type names **Isometric**, **Concentric**, **Eccentric**, **Stretching** reuse existing copy (`TYPE_LABELS` / programs builder).

Reason lines: use **T3** when the approved exercise category is strengthening and the row type does not fit; use **T16** when the approved category is stretching and the row type is strengthening.

### Reused unchanged

| String | Source |
| -- | -- |
| Pending review | `src/ui/copy/programs.ts` `PENDING_REVIEW_BADGE` |
| Placeholder. It links to the real exercise once you approve the draft. | `PLACEHOLDER_ROW_NOTE` |
| Remove {name}, Duplicate {name} | v12 builder row actions |
| Add exercise (sheet) | `ADD_EXERCISE` |

### Explicitly not approved (do not ship)

| String | Notes |
| -- | -- |
| An approved exercise doesn't fit its row's type. Your patient sees it as a placeholder until you fix it. | Exploration option B banner body only. Dropped in lock `7e4a9711` (publish blocked per DIDI-1186). |
| Type doesn't match | Option C badge only. |
| Close | MagicPath preview toggles **Fix** to **Close** when open; not in Nov 21 approval. |
| Link as {type} / sheet actions from option C | Not variant B. |

### Out of scope (follow-up ticket)

| Topic | Rule |
| -- | -- |
| `request_closed` row UI | Render like `awaiting_approval` per DIDI-1106 comment `56b379c5` until a separate design spec covers it. |

### Accessible names

| Control | Accessible name | Record |
| -- | -- | -- |
| Type choice (builder Fix panel) | Link {exercise} as {type} | **Designer pick** (`b650a678`) |
| **Show me** (banner) | Show me exercises that didn't link | **Designer pick** (`b650a678`) |
| **Fix** (publish sheet row) | Fix for {name} | **Designer pick** (`a3f73814`) |
| Programs list flag | Same as visible flag text (**T14** / **T15**) | Locks **T14** / **T15** |

## Product direction alignment

### Locked Product direction (verbatim sources)

**DIDI-594 description, section "Exercise database (decided Oct 23, 2026, Diadem)"** (https://linear.app/didi-build/issue/DIDI-594):

> * **Not blocking a program.** A request shouldn't stop Kojo mid-program. Allow a placeholder line (name, sets, reps) that links to the real exercise once it's approved. Confirm this in the architecture step.

**DIDI-594 comment, 2026-10-24 18:43 UTC** (DIDI-827 picks, excerpt):

> 2. "2C: all practitioners see it and any can approve"

**DIDI-594 comment, 2026-10-24 22:58 UTC** (DIDI-828 answers, excerpt):

> - Q7, 6:57 PM: "7B: no notification in V1"

**DIDI-1105 issue description, CTO on DIDI-1005** (https://linear.app/didi-build/issue/DIDI-1005, Oct 30, 2026, 4:52 AM ET, excerpt):

> **Type mismatch on approval.** If a placeholder's type doesn't fit the approved exercise (a stretching type on a strengthening exercise, or the reverse), `linkApprovedPlaceholders` skips that row and leaves it a placeholder. It doesn't reset the type, because that would silently change the practitioner's prescription. It doesn't fail the approval either, because approval is a community action and one practitioner's program mustn't block it. Rows that do fit still link.

**DIDI-594 / DIDI-1186, Nov 8, 2026** (programs spec, Diadem verbatim):

> Block publish until every placeholder is approved or removed.

### Is / was (this feature only)

| Topic | Was | Is |
| -- | -- | -- |
| Skipped row after approval | Looked like **Pending review** ("Placeholder. It links to the real exercise once you approve the draft.") even when the draft was already approved (baseline exploration) | `type_mismatch` rows show **Didn't link**, row type, reason (**T3** or **T16**), and **Fix** |
| Publish sheet placeholder list | Every placeholder showed **Pending review** and **Review draft** (DIDI-1186) | `type_mismatch` rows show **Didn't link**, publish-sheet **Fix**, and **Remove** (**Designer pick**, `b650a678`) |
| Publish notice body with didn't-link rows | Draft-approval body only (awkward for didn't-link rows until follow-up) | Mixed: approved body plus **T18**; all `type_mismatch`: **T19** (**Designer pick**, `a3f73814`) |
| Practitioner feedback | None | Variant **B** banner plus compact row |
| Banner body | Exploration proposed a second line about the patient seeing a placeholder | **Removed** in lock `7e4a9711`. Heading only (**T5** / **T6**) plus **Show me** |
| Programs list | No flag for skipped link | Card flag reuses banner heading copy (**T14** / **T15**) |
| Dose on Fix | Open in exploration | Keep sets and reps when fixed (Q22, Nov 21, 2026) |
| Skip rule | DIDI-1005 | Unchanged; this spec is display and fix only |

**Matches Product direction: yes.** Skipping mismatched rows matches DIDI-1005. Placeholders still unblock programs in principle, but publish stays blocked until resolved (DIDI-1186). Any practitioner can approve (2C); v1 has no approval notification (7B), so in-app builder and list messaging fits.

## Mockups

Full-width phone captures (390 px). Desktop uses the same components in the programs builder at 1280 px (no separate PNG where layout matches [programs/spec.md](../programs/spec.md) builder).

| State | Phone (390 px) | Desktop (1280 px) | Notes |
| -- | -- | -- | -- |
| 01 builder banner plus compact row | [phone](mockups/01-builder-banner-phone.png) | (same layout; phone capture only) | Heading **T5** only plus **Show me**; no dropped banner body. Row **T1** to **T4**. Capture width 390 px. |
| 02 fix expanded | [phone](mockups/02-builder-fix-expanded-phone.png) | [desktop](mockups/02-builder-fix-expanded-desktop.png) | **Fix** open with builder banner **T5** still visible; type choices **T8** to **T11** and **Pick another exercise**. Re-capture with `mockups/capture-mockups.mjs` when the board changes. |

No gallery components in the Physio POC app ([DIDI-1105](https://linear.app/didi-build/issue/DIDI-1105) design-as-code exception).

## Decisions

1. Variant **B** only (Nov 21, 2026). Options A and C are rejected.
2. Badge **Didn't link**, not "Type doesn't match".
3. Builder banner is status only: singular or plural heading plus **Show me**; no patient-facing placeholder explanation on the banner.
4. Fix is inline on the row, not a sheet (variant C retired).
5. `awaiting_approval` rows untouched.
6. `request_closed` deferred; treat as `awaiting_approval` in UI until specified.
7. Programs card flag reuses banner heading strings.
8. Link toast with **Undo** restores skipped state.
9. Publish sheet lists `type_mismatch` placeholders with **Didn't link**, publish-sheet **Fix**, and **Remove** (**Designer pick**, `b650a678`).
10. Reverse mismatch reason **T16** and builder or banner accessible names (**Designer pick**, `b650a678`).
11. Publish notice body **T18** and **T19**; publish-sheet **Fix for {name}** (**Designer pick**, `a3f73814`).

## Build notes

- Dev counterpart: [DIDI-1106](https://linear.app/didi-build/issue/DIDI-1106). All new strings go in `src/ui/copy` after this spec merges.
- Depends on `placeholder_state` from DIDI-1106 (`type_mismatch` drives all states in this spec).
- **Pick another exercise** reuses the existing Add exercise sheet ([programs/spec.md](../programs/spec.md) States).
- Type hints **T8** to **T10** match `programModel.ts` `TYPE_HINT` for strengthening types; stretch hint for reverse case reuses **Hold a stretch**.
- No Cloudflare or production changes in the design PR.

## Changes

- **Nov 21, 2026**: DIDI-1105 follow-up (`design/DIDI-1105-followup`). Publish notice **T18** and **T19**; **Fix for {name}** via `a3f73814`. Mockup 02 with banner visible. https://linear.app/didi-build/issue/DIDI-1105
- **Nov 21, 2026**: DIDI-1105 PR #142 QA R1. Publish-sheet **Fix** (`b650a678`); **T16** and a11y picks cite `b650a678`; banner body drop cites `7e4a9711`; **T14** at 12:57 AM EST (`c8a1509f`); mockups 01 and 02 re-rendered at 390 px (and 02 at 1280 px). https://linear.app/didi-build/issue/DIDI-1105
- **Nov 21, 2026**: DIDI-1105 follow-up (PR #142). CTO locks `2bdbb75b`, `7e4a9711`, `c8a1509f` recorded. https://linear.app/didi-build/issue/DIDI-1105
- **Nov 21, 2026**: DIDI-1105. Diadem approved variant B, strings T1 to T15, Q22 dose preservation, Q23 Programs card flag, banner plural (12:57 AM EST). Spec, mockup reference, and product direction alignment. Unblocks [DIDI-1106](https://linear.app/didi-build/issue/DIDI-1106). https://linear.app/didi-build/issue/DIDI-1105