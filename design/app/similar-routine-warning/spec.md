# Similar routine warning (New routine)

Area: app · Feature: similar-routine-warning

## Purpose

On the **New routine** draft flow (and the same draft editor when editing a draft), warn the practitioner when other routines look similar, without blocking autosave, **Done for now**, or **Publish**. Variant **B. Live inline card**: once the draft has enough data, the app checks in the background; when matches exist, an amber card lists up to three similar routines above the footer actions. **View** opens a read-only preview sheet over the form. **Continue anyway** dismisses the warning for this draft session.

The parent form fields (including **Conditions**, condition-first layout) follow [DIDI-1216](https://linear.app/didi-build/issue/DIDI-1216); only the similar-routine warning strings and behaviour are in scope here.

**Matches Product direction: yes.** Checked against [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) entries L and L update 1 (Nov 10, 2026), L update 2 (Nov 11, 2026, comment `03489a7e`), behaviour lock comment `e5aa6515`, string locks `61c1b98a` and `f4682350`, and [DIDI-1224](https://linear.app/didi-build/issue/DIDI-1224).

## Design source (approved Nov 11 and Nov 19, 2026)

| Choice | MagicPath link | Component id | Revision |
| -- | -- | -- | -- |
| B. Live inline card (final) | https://designs.magicpath.ai/v1/boldly-hill-9072 | 471088919975432192 | 471088919975432193 |

**Diadem, Nov 11, 2026, 7:10 PM EST**, verbatim (locked on DIDI-594 comment `03489a7e`): `1224: B`.

Source components: `BLiveInlineCard.tsx` / `SrBoard.tsx` revision `471088919975432193`. Mockups are **full-height** element captures from that board (phone column 390 px wide, desktop 1280 px wide). Heights vary by state; see the mockup table below. No design-preview chrome.

## Locked Product direction (verbatim)

**DIDI-594**, Diadem, Nov 10, 2026, 8:55 PM EST (Entry L, via Designer chat):

> the only place where AI can fit in is finding duplicates/similar routines because we don't want to clutter the routine library with clutter

**DIDI-594**, Diadem, Nov 10, 2026, 9:01 PM EST (L update 1, CTO chat):

> Build duplicate detection now and warn while creating a routine

Routines get no AI generation or regenerate on this path; similarity is plain matching on the server today (`ai_similarity_enabled` stays false until a later ticket).

## Locked behaviour

### Variant B trigger and non-blocking (DIDI-594 L update 2, comment `03489a7e`, Nov 11, 2026, 7:10 PM EST)

Recorded on DIDI-594 from Diadem in Designer's chat. Designer describes B as: **the check runs in the background once the draft has 1 condition and 2 exercises, re-checks after changes, and never blocks a draft or Publish.**

### Matching scope and display cap (DIDI-594 comment `e5aa6515`, Nov 19, 2026, 2:21 PM EST)

Quoted verbatim:

- Keep today's rule but show up to 3
- Keep plain matching on exercises, with a shared condition as a boost
- Keep searching community routines plus my own drafts and published routines

## Locked strings (DIDI-594 comment `61c1b98a`, Nov 19, 2026, 2:14 PM EST)

Diadem: "Yes, approve all five strings", for exactly these:

| String | Role |
| -- | -- |
| Similar routines already exist | Warning card title |
| These look close to yours. Open one to compare, or carry on with yours. | Warning card body |
| Shares {k} of your {n} exercises | Per-match overlap line; `{k}` = `shared_exercise_ids.length`, `{n}` = draft exercise count |
| View | Per-match action |
| Continue anyway | Dismisses the warning for this draft |

## Timing and behaviour (variant B)

Derived from MagicPath board revision `471088919975432193` and DIDI-594 locks above. Rows marked **Open: needs Diadem approval** are visible in variant B but not locked on DIDI-594 yet (Designer is checking with Diadem on the B board).

| Topic | Rule |
| -- | -- |
| When the first check runs | In the background once the draft has **at least 1 condition and 2 exercises** (DIDI-594 L update 2, `03489a7e`). Until then, no check and no warning UI. |
| Re-check | After condition or exercise changes (DIDI-594 L update 2, `03489a7e`). **Open: needs Diadem approval** on the B board: exact debounce or scheduling detail. |
| Never blocks | Autosave, **Done for now**, and **Publish** are never blocked by the check running, waiting, succeeding, failing, or by the daily AI cap (DIDI-594 L update 2, `03489a7e`). |
| Matches found | Amber card above the footer buttons. Lists **at most 3** matches, best score first (see server sort below). **Publish** and **Done for now** stay enabled. |
| View | Opens a preview sheet over the form; draft stays underneath. Sheet title is the matched routine's name. Close returns to the form with draft unchanged. **Open: needs Diadem approval** on the B board: whether navigation ever leaves the draft editor. |
| Continue anyway | Hides the card for this draft. **Open: needs Diadem approval** on the B board: when the card may show again after later edits. |
| No match | No warning UI. **Publish** opens **Publish this routine?** with the routine card, **What happens** bullets, and **Publish now** / **Not yet** (same structure as [routines mockup 15](../routines/mockups/15-publish-routine-sheet-phone.png); sample routine name and tags in PNGs are not copy). |
| Check failed or AI cap | **Open: needs Diadem approval** on the B board: failed check and reached AI cap are indistinguishable on screen. **Publish** behaviour matches no match when nothing is shown. |
| Shared condition highlight | **Open: needs Diadem approval** on the B board: filled teal chips for conditions shared with the draft, outline chips for other conditions on the match row. |
| Match row content | Routine name, condition chips (when present), overlap line, **View**. **Open: needs Diadem approval** on the B board: omitting "Used N times" on compact B list rows. |
| Scope | Published community routines plus the caller's own drafts and published routines; **My routines** saved copies are excluded from candidacy (server scope; lock `e5aa6515`). |

## Server contract (build reference, not designed here)

`POST /api/me/routines/similar` ([PR 116](https://github.com/didi-build/physio-poc/pull/116), `8b35025`):

| Input | Notes |
| -- | -- |
| `exercise_ids`, `condition_ids` | Draft sets; optional when `draft_routine_id` is sent |
| `draft_routine_id` or `exclude_routine_id` | **Required** so the draft does not match itself |

| Output | Notes |
| -- | -- |
| `matches[]` | Up to server `maxResults`; each item has `routine_id`, `score`, `exercise_jaccard`, `condition_match`, `shared_exercise_ids`, `shared_condition_ids` |
| No names/titles | UI must join `routine_id` to routine data already in memory or fetch routine detail separately (**build note** for Developer and CTO; do not add names to this API in the design spec) |

Scoring (`src/services/routines/routine-similarity-score.ts`, `src/routine-similarity-config.ts`):

- Score = exercise Jaccard + 0.1 when at least one condition id is shared (`condition_match_bonus`).
- Threshold >= 0.5 (`DEFAULT_ROUTINE_SIMILAR_THRESHOLD`).
- Sort: `score` descending, then `routine_id` ascending.

**Dependency:** [DIDI-1263](https://linear.app/didi-build/issue/DIDI-1263) (Ready for dev): lower `DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS` from **5** to **3** so the server default matches the UI cap. Until then, the client must not show more than 3 matches.

## Layout and accessibility

From variant B source (`SrBoard.tsx` revision `471088919975432193`):

| Element | Markup / behaviour |
| -- | -- |
| Similar routines card | `<section role="status" aria-live="polite">` wrapping the amber warning. Title is a heading inside the section (`<h2>`). |
| Preview sheet | `role="dialog"` with `aria-labelledby` pointing at the sheet heading. Heading text is the matched routine's name (runtime). Body shows badges, meta line, exercise list, and primary actions from reused routine strings. |
| **Publish this routine?** sheet | Same dialog pattern; `aria-labelledby` references the **Publish this routine?** heading (reused publish strings from `src/ui/copy/routines.ts`). |
| Close control | Icon button with `aria-label` **Close** (`src/ui/copy/a11y.ts` `ARIA_CLOSE_SCRIM`). |
| Condition chip remove | Icon button with accessible name **Remove {condition}** (W7); `{condition}` is the chip label at runtime. |
| Match row **View** | Text button showing **View** (W4). **Open: needs Diadem approval** (described need only): distinguishable accessible names per row when multiple **View** buttons are present. |
| Shared exercise check in preview | Glyph marking exercises that overlap the draft. **Open: needs Diadem approval** (described need only): screen reader text for that indicator. |

## States (mockups)

| # | State | What it shows |
| -- | -- | -- |
| 01 | form | New routine draft with conditions and exercises filled; check has run; **no** warning yet (no matches, or still below trigger). Same baseline as [routines mockup 11](../routines/mockups/11-new-routine-draft-autosaved-phone.png) plus condition chips from DIDI-1216 exploration. |
| 02 | warn | Matches found: amber **Similar routines already exist** card with up to three rows and **Continue anyway**, footer **Done for now** / **Publish** visible below. |
| 03 | view | **View** opened: preview sheet over the form (routine name once in the sheet title, not duplicated in the body). |
| 04 | continue | **Continue anyway** taken: no warning card; **Publish this routine?** sheet over the form. |
| 05 | nomatch | No warning; **Publish this routine?** sheet over the form. **Pixels match state 04 and 06**; capture is from `nomatch` state in the B board (logic: no similar routines). |
| 06 | failed | **Pixels match state 04 and 05**; capture is from `failed` state in the B board (logic: check failed or AI cap, no warning UI). |

**Capture sizes** (full frame, RGB PNG):

| State | Phone width × height | Desktop width × height |
| -- | -- | -- |
| 01 form | 390 × 725 | 1280 × 757 |
| 02 warn | 390 × 1211 | 1280 × 1115 |
| 03 view | 390 × 1211 | 1280 × 1115 |
| 04 continue | 390 × 725 | 1280 × 757 |
| 05 nomatch | 390 × 725 | 1280 × 757 |
| 06 failed | 390 × 725 | 1280 × 757 |

| State | Phone | Desktop |
| -- | -- | -- |
| 01 form | [phone](mockups/01-form-phone.png) | [desktop](mockups/01-form-desktop.png) |
| 02 warn | [phone](mockups/02-warn-phone.png) | [desktop](mockups/02-warn-desktop.png) |
| 03 view | [phone](mockups/03-view-phone.png) | [desktop](mockups/03-view-desktop.png) |
| 04 continue | [phone](mockups/04-continue-phone.png) | [desktop](mockups/04-continue-desktop.png) |
| 05 nomatch | [phone](mockups/05-nomatch-phone.png) | [desktop](mockups/05-nomatch-desktop.png) |
| 06 failed | [phone](mockups/06-failed-phone.png) | [desktop](mockups/06-failed-desktop.png) |

## Strings

### Approved (Diadem, Nov 19, 2026, EST)

| Id | String | When approved |
| -- | -- | -- |
| W1 | Similar routines already exist | 2:14 PM (with W2 to W5, DIDI-594 comment `61c1b98a`) |
| W2 | These look close to yours. Open one to compare, or carry on with yours. | 2:14 PM |
| W3 | Shares {k} of your {n} exercises | 2:14 PM |
| W4 | View | 2:14 PM |
| W5 | Continue anyway | 2:14 PM |
| W6 | {n} total | 2:43 PM (DIDI-594 comment `f4682350`) |
| W7 | Remove {condition} | 2:43 PM (`f4682350`) |

**Diadem, Nov 19, 2026, 2:14 PM EST**, verbatim: "Yes, approve all five strings" (W1 to W5).

**Diadem, Nov 19, 2026, 2:43 PM EST**, verbatim (DIDI-594 comment `f4682350`): Yes, approve "{n} total" and "Remove {condition}".

### Reused from repo (verified)

| String | Source |
| -- | -- |
| Routines | `src/ui/copy/routines.ts` `BACK_ROUTINES` (line 107) |
| New routine | `src/ui/copy/routines.ts` `NEW_ROUTINE` (line 221) |
| Draft | `src/ui/copy/routines.ts` `TAG_DRAFT` (line 66) |
| Draft saved. Only you can see it until you publish. | `src/ui/copy/routines.ts` `DRAFT_SAVED_UNTIL_PUBLISH` (lines 242-243) |
| Routine name | `src/ui/copy/routines.ts` `ROUTINE_NAME_LABEL` (line 223) |
| Exercises | `src/ui/copy/routines.ts` `EXERCISES_HEADING` (line 128) |
| Add exercise | `src/ui/copy/routines.ts` `ADD_EXERCISE` (line 237) |
| Done for now | `src/ui/copy/routines.ts` `DONE_FOR_NOW` (line 251) |
| Publish | `src/ui/copy/routines.ts` `PUBLISH` (line 249) |
| Publish this routine? | `src/ui/copy/routines.ts` `PUBLISH_THIS_ROUTINE` (line 258) |
| What happens | `src/ui/copy/routines.ts` `WHAT_HAPPENS` (line 262) |
| It goes live as version 1 in All routines, for every practitioner. | `src/ui/copy/routines.ts` `PUBLISH_POINT_LIVE_V1` (lines 263-264) |
| Anyone can use it, improve it and restore older versions. Every change is kept in version history. | `src/ui/copy/routines.ts` `PUBLISH_POINT_VERSION_HISTORY` (lines 265-266) |
| There is no review step. Routines reuse approved exercises, so nothing new needs checking. | `src/ui/copy/routines.ts` `PUBLISH_POINT_NO_REVIEW` (lines 267-268) |
| Publish now | `src/ui/copy/routines.ts` `PUBLISH_NOW` (line 259) |
| Not yet | `src/ui/copy/routines.ts` `NOT_YET` (line 260) |
| Use for a patient | `src/ui/copy/routines.ts` `USE_FOR_PATIENT` (line 131) |
| Save to My routines | `src/ui/copy/routines.ts` `SAVE_TO_MY_ROUTINES` (line 110) |
| Community routine · Version {version} · Updated {date} by {by} · Used {usage} times | `src/ui/copy/routines.ts` `communityRoutineMeta` (lines 181-188) |
| Close | `src/ui/copy/a11y.ts` `ARIA_CLOSE_SCRIM` (line 3), sheet close control |

### Open: needs Diadem approval

Strings visible in the B mockups or required for accessibility that are not in the approved table above. Do not treat these as final copy. Where the UI needs text that does not exist yet, only the need is stated.

| Need | Where it appears |
| -- | -- |
| Conditions | Label shown in mockups above condition chips. On main today: `CONDITION` = "Condition" (`src/ui/copy/routines.ts` line 46, singular). Held for Diadem decision (BLOCKER, mockups unchanged). |
| Preview sheet title | Uses the matched routine's name at runtime (sample names in mockups are not copy) |
| Optional in-progress indicator | No user-visible string today; open product decision if the check should ever show progress while a re-check runs |
| Per-row **View** accessible names | Multiple **View** buttons in the warning card |
| Shared-exercise indicator in preview | Overlap marker on exercises in the preview sheet |

Failed-state and no-match **copy**: none shown by design (no strings to approve).

Behaviour rows marked **Open: needs Diadem approval** in Timing and behaviour are pending Diadem review on the B board (see that section).

## Decisions

1. Variant **B** inline card (`03489a7e`, Nov 11, 2026). Not variant A sheet-at-publish or variant C chip.
2. List at most **3** matches in the UI (`e5aa6515`); server cap follows [DIDI-1263](https://linear.app/didi-build/issue/DIDI-1263).
3. Plain exercise Jaccard + condition bonus on the server; threshold 0.5; not an AI call while `ai_similarity_enabled` is false.
4. Warning never blocks draft save, exit, or publish (`03489a7e`).
5. Align with condition-first New routine layout from DIDI-1216 for non-warning fields; warning placement is above footer actions only.
6. Mobile first: card and sheet work at 390 px; at 1280 px the form uses a wider centered column, sheet centers on desktop.

## Build notes

- Join `routine_id` from `POST /api/me/routines/similar` to routine titles, conditions, and thumbnails for list and preview rows; the API does not return display fields.
- Send `draft_routine_id` (preferred when the draft exists server-side) or `exclude_routine_id` on every check so the draft never matches itself.
- Cap displayed matches at 3 even before [DIDI-1263](https://linear.app/didi-build/issue/DIDI-1263) lands.
- No gallery components in Physio POC (spec and mockups only).

## Changes

- **Nov 19, 2026**: DIDI-1224 QA R1. Re-render mockups (full frames, fixed states 04 to 06), layout/a11y section, L update 2 lock `03489a7e`, behaviour and copy lock ids, Conditions blocker note, DIDI-1263 dependency. https://linear.app/didi-build/issue/DIDI-1224
- **Nov 19, 2026**: DIDI-1224. Diadem approved W6 `{n} total` and W7 `Remove {condition}` at 2:43 PM EST (`f4682350`). https://linear.app/didi-build/issue/DIDI-1224
- **Nov 19, 2026**: DIDI-1224. Variant B spec, five approved strings, behaviour locks, six states, mockups from MagicPath revision `471088919975432193`. Unblocks [DIDI-1226](https://linear.app/didi-build/issue/DIDI-1226). https://linear.app/didi-build/issue/DIDI-1224