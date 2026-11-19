# Similar routine warning (New routine)

Area: app · Feature: similar-routine-warning

## Purpose

On the **New routine** draft flow (and the same draft editor when editing a draft), warn the practitioner when other routines look similar, without blocking autosave, **Done for now**, or **Publish**. Variant **B. Live inline card**: once the draft has enough data, the app checks in the background; when matches exist, an amber card lists up to three similar routines above the footer actions. **View** opens a read-only preview sheet over the form. **Continue anyway** dismisses the warning for this draft session.

The parent form fields (including **Conditions**, condition-first layout) follow [DIDI-1216](https://linear.app/didi-build/issue/DIDI-1216); only the similar-routine warning strings and behaviour are in scope here.

**Matches Product direction: yes.** Checked against [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) L and L update 1 (Nov 10, 2026), Diadem approvals on [DIDI-1224](https://linear.app/didi-build/issue/DIDI-1224) and [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) comments cited below.

## Design source (approved Nov 11 and Nov 19, 2026)

| Choice | MagicPath link | Component id | Revision |
| -- | -- | -- | -- |
| B. Live inline card (final) | https://designs.magicpath.ai/v1/boldly-hill-9072 | 471088919975432192 | 471088919975432193 |

**Diadem, Nov 11, 2026, 7:10 PM EST**, verbatim (locked on DIDI-594 comment `03489a7e`): `1224: B`.

Source components: `BLiveInlineCard.tsx` / `SrBoard.tsx` revision `471088919975432193`. Mockups rendered from that source at phone 390 by 844 px and desktop 1280 by 900 px.

## Locked Product direction (verbatim)

**DIDI-594**, Diadem, Nov 10, 2026, 8:55 PM EST (Entry L, via Designer chat):

> the only place where AI can fit in is finding duplicates/similar routines because we don't want to clutter the routine library with clutter

**DIDI-594**, Diadem, Nov 10, 2026, 9:01 PM EST (L update 1, CTO chat):

> Build duplicate detection now and warn while creating a routine

Routines get no AI generation or regenerate on this path; similarity is plain matching on the server today (`ai_similarity_enabled` stays false until a later ticket).

## Locked behaviour (Diadem, Nov 19, 2026, 2:21 PM EST, DIDI-594 comment)

Quoted verbatim:

- Keep today's rule but show up to 3
- Keep plain matching on exercises, with a shared condition as a boost
- Keep searching community routines plus my own drafts and published routines

## Locked strings (Diadem, Nov 19, 2026, 2:14 PM EST, DIDI-594 comment `61c1b98a`)

Diadem: "Yes, approve all five strings", for exactly these:

| String | Role |
| -- | -- |
| Similar routines already exist | Warning card title |
| These look close to yours. Open one to compare, or carry on with yours. | Warning card body |
| Shares {k} of your {n} exercises | Per-match overlap line; `{k}` = `shared_exercise_ids.length`, `{n}` = draft exercise count |
| View | Per-match action |
| Continue anyway | Dismisses the warning for this draft |

## Timing and behaviour (variant B)

From the approved exploration board (`comment.md`), variant B. Parts not covered by the Nov 19 behaviour lock are marked **proposed**.

| Topic | Rule |
| -- | -- |
| When the first check runs | **Proposed (exploration B, not separately locked):** in the background once the draft has **at least 1 condition and 2 exercises**. Until then, no check and no warning UI. |
| Re-check | **Proposed:** debounced after condition or exercise changes. |
| Never blocks | Autosave, **Done for now**, and **Publish** are never blocked by the check running, waiting, succeeding, failing, or by the daily AI cap. Confirmed in exploration for all variants; not contradicted by Nov 19 locks. |
| Matches found | Amber card above the footer buttons. Lists **at most 3** matches, best score first (see server sort below). **Publish** and **Done for now** stay enabled. |
| View | Opens a preview sheet over the form; draft stays underneath. Sheet title is the matched routine's name. Close returns to the form with draft unchanged. **Proposed:** no navigation away from the draft editor. |
| Continue anyway | Hides the card for this draft until a **proposed** re-match after a later edit changes conditions or exercises enough to pass the threshold again. |
| No match | No warning UI. **Publish** opens the existing **Publish this routine?** sheet as today ([routines spec](../routines/spec.md) mockup 15). |
| Check failed or AI cap | Same as no match: show nothing, no error surface, **Publish** works as usual. **Proposed** (exploration): failed check and reached AI cap are indistinguishable on screen. |
| Shared condition highlight | **Proposed:** condition chips that appear in both the draft and the match use the filled teal style; other condition chips on the match use the outline style. |
| Match row content | Routine name, condition chips (when present), overlap line, **View**. **Proposed:** omit "Used N times" on the compact B rows (shown on the preview sheet only via existing routine detail copy patterns). |
| Scope | Published community routines plus the caller's own drafts and published routines; **My routines** saved copies are excluded from candidacy (server scope). |

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

**Dependency (CTO/dev, not this design PR):** UI shows at most **3** matches; server default `maxResults` is **5** (`DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS` in `src/routine-similarity-config.ts`). Lower the default or cap the client to 3 in a follow-up ticket.

## States (mockups)

| # | State | What it shows |
| -- | -- | -- |
| 01 | form | New routine draft with conditions and exercises filled; check has run; **no** warning yet (no matches, or still below trigger). Same baseline as [routines mockup 11](../routines/mockups/11-new-routine-draft-autosaved-phone.png) plus condition chips from DIDI-1216 exploration. |
| 02 | warn | Matches found: amber **Similar routines already exist** card with up to three rows and **Continue anyway**. |
| 03 | view | **View** opened: preview sheet over the form (sample routine content). |
| 04 | continue | **Continue anyway**: card hidden; **Publish this routine?** sheet open ([routines mockup 15](../routines/mockups/15-publish-routine-sheet-phone.png)). |
| 05 | nomatch | No warning; **Publish this routine?** sheet open (indistinguishable from 04 on screen; logic differs). |
| 06 | failed | Same screen as 05: no warning; failed check shows nothing (**proposed**). |

Phone 390 by 844 px; desktop 1280 by 900 px. No preview chrome.

| State | Phone | Desktop |
| -- | -- | -- |
| 01 form | [phone](mockups/01-form-phone.png) | [desktop](mockups/01-form-desktop.png) |
| 02 warn | [phone](mockups/02-warn-phone.png) | [desktop](mockups/02-warn-desktop.png) |
| 03 view | [phone](mockups/03-view-phone.png) | [desktop](mockups/03-view-desktop.png) |
| 04 continue | [phone](mockups/04-continue-phone.png) | [desktop](mockups/04-continue-desktop.png) |
| 05 nomatch | [phone](mockups/05-nomatch-phone.png) | [desktop](mockups/05-nomatch-desktop.png) |
| 06 failed | [phone](mockups/06-failed-phone.png) | [desktop](mockups/06-failed-desktop.png) |

## Strings

### Approved (Diadem, Nov 19, 2026, 2:14 PM EST)

| Id | String |
| -- | -- |
| W1 | Similar routines already exist |
| W2 | These look close to yours. Open one to compare, or carry on with yours. |
| W3 | Shares {k} of your {n} exercises |
| W4 | View |
| W5 | Continue anyway |

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
| Remove {name} | `src/ui/copy/routines.ts` `removeExerciseAria` (lines 339-340), condition chip remove pattern **proposed** to match exercise remove labeling |

### Open: needs Diadem approval

Strings visible in the B mockups or required for accessibility that are not in the table above. Do not treat these as final copy. Where the UI needs text that does not exist yet, only the need is stated.

| Need | Where it appears |
| -- | -- |
| Conditions | Field label on the New routine form (owned by [DIDI-1216](https://linear.app/didi-build/issue/DIDI-1216); not approved on this ticket) |
| Condition chip remove control accessible name | Exploration uses `Remove {condition name}` via the same pattern as `Remove {name}` for exercises; needs explicit approval for conditions if wording differs |
| Exercise count suffix on the draft list | Mockup shows `{n} total` beside **Exercises**; no matching string in `src/ui/copy/routines.ts` today |
| Preview sheet title | Uses the matched routine's name at runtime (sample names in mockups are not copy) |
| Optional in-progress indicator | No user-visible string today; open product decision if the check should ever show progress while debounced re-check runs |

Failed-state and no-match **copy**: none shown by design (no strings to approve).

## Decisions

1. Variant **B** inline card (Nov 11 lock). Not variant A sheet-at-publish or variant C chip.
2. List at most **3** matches in the UI (Nov 19 lock); server cap change is a dependency.
3. Plain exercise Jaccard + condition bonus on the server; threshold 0.5; not an AI call while `ai_similarity_enabled` is false.
4. Warning never blocks draft save, exit, or publish.
5. **Continue anyway** is per-draft dismissal until a new match appears after edits (**proposed** re-show rule from exploration).
6. Align with condition-first New routine layout from DIDI-1216 for non-warning fields; warning placement is above footer actions only.
7. Mobile first: card and sheet work at 390 px; at 1280 px the form uses a wider centered column, sheet centers on desktop.

## Build notes

- Join `routine_id` from `POST /api/me/routines/similar` to routine titles, conditions, and thumbnails for list and preview rows; the API does not return display fields.
- Send `draft_routine_id` (preferred when the draft exists server-side) or `exclude_routine_id` on every check so the draft never matches itself.
- Cap displayed matches at 3 even before server default changes.
- No gallery components in Physio POC (spec and mockups only).

## Changes

- **Nov 19, 2026**: DIDI-1224. Variant B spec, five approved strings, behaviour locks, six states at 390 and 1280, mockups from MagicPath revision `471088919975432193`. Unblocks [DIDI-1226](https://linear.app/didi-build/issue/DIDI-1226). https://linear.app/didi-build/issue/DIDI-1224