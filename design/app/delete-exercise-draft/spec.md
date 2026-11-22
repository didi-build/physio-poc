# Delete an exercise-request draft

Area: app · Feature: delete-exercise-draft

## Purpose

A practitioner can delete an exercise-request draft that is not approved yet, from the **draft review** page ([exercise-requests/spec.md](../exercise-requests/spec.md), [draft-review-ai-states/spec.md](../draft-review-ai-states/spec.md)) or from a row on **Requests and drafts**. Delete is a soft delete: the request is set to the existing `withdrawn` status, so audit and history are kept, and it leaves Requests and drafts for every practitioner. A confirmation dialog always comes first. Delete is blocked only while a generation is actually running. There is no Undo and no notification.

Parent flows (search, request, review, approve) stay in [exercise-requests/spec.md](../exercise-requests/spec.md). Generation states on the review page stay in [draft-review-ai-states/spec.md](../draft-review-ai-states/spec.md).

**Matches Product direction: yes.** Checked against [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) comment `7d456440` and Diadem's answers of Nov 21, 2026, 7:22 PM EST, quoted below.

**Diadem, CTO chat, Nov 21, 2026, 7:07 PM EST**, verbatim (locked on DIDI-594 comment `7d456440`). CTO asked: "there's no way to delete a draft right now. Do you want practitioners to be able to remove one?"

> "delete a draft right after this fix"

"This fix" is [DIDI-1275](https://linear.app/didi-build/issue/DIDI-1275) and [DIDI-1276](https://linear.app/didi-build/issue/DIDI-1276).

**Diadem, Designer's chat, Nov 21, 2026, 7:22 PM EST**, verbatim card picks (recorded on [DIDI-1277](https://linear.app/didi-build/issue/DIDI-1277) comment `029bad60`, relayed to CTO for DIDI-594):

1. Which option? "A"
2. Stuck requests: "Block delete only while a generation is actually running, so stuck requests can be deleted"
3. Notification: "No notification to the requester when someone else deletes their request"
4. CTO rules: "Yes to CTO's four rules: soft delete, confirm step, blocked while drafting, any practitioner can delete"

The four rules in answer 4 were CTO picks on `7d456440` (soft delete as `withdrawn`, a confirmation step, blocked while generating, any practitioner who can review the draft can delete it). Diadem's 7:22 PM answer makes them his decision. Answer 2 narrows "blocked while drafting" to "only while a generation is actually running".

## Design source (approved Nov 21, 2026, 7:22 PM EST)

| Choice | MagicPath link | Component id | Revision |
| -- | -- | -- | -- |
| A. Delete in the toolbar (final) | https://designs.magicpath.ai/v1/lively-city-6612 | 475044550583402496 | 475046956582977536 |

Project: [DIDI-1277 Delete exercise draft](https://www.magicpath.ai/files/475044514025836544). Source: `DelBoard.tsx` with `v="A"`, revision `475046956582977536`. Baseline (today on main): [calm-hour-3094](https://designs.magicpath.ai/v1/calm-hour-3094), component `475044535567790080`, revision `475044535567790081`. Variants B (More menu), C (end of page, Undo) and D (inline confirm, Undo) on the same project are exploration only.

**Mockup caveats:**

- Amber dashed highlights and D numbers mark new strings in the mockups only. In build, Delete draft is red text (`text-red-700` equivalent) with no highlight; the highlight also hides the disabled styling in the mockups. **This spec wins** on the disabled state.
- Sample data (exercise names, "Kojo", note text) is not copy.

## Behaviour

| Topic | Rule |
| -- | -- |
| Review page placement, 390 px | **Delete draft** (D1) is a red text button on its own line directly under the toolbar (**Approve**, **Regenerate**, `{n} of 5 left today`). Minimum 44 px tap height. |
| Review page placement, 1280 px | **Delete draft** (D1) sits at the right end of the same toolbar row, after `{n} of 5 left today`. |
| List row placement, 390 px | Each row on **Requests and drafts** shows **Delete draft** (D1) as a red text button under **Review draft** / **Review and approve** (or after **Usually ready in a minute** on an AI drafting row). |
| List row placement, 1280 px | **Delete draft** (D1) sits in the row's action area to the right of the review button. |
| Confirmation | Always a **centred dialog** at every width (not a sheet). Title D2, body D3 then D4. Buttons **Cancel** (secondary) and **Delete draft** (D1, red, primary position). Cancel, Escape or a scrim click closes it with no change. |
| Blocked while generating | Delete draft is **disabled** with D7 under it **only while a generation is actually running** (the server's generation lock is held), on the review page and on the row. This covers the first draft, **Regenerate text** and media regenerates. |
| Stuck requests | An `open` request that shows **AI drafting** with no generation running can be deleted (Diadem answer 2). Delete draft is enabled on that row. |
| Failed generation | A draft showing G1 or G2 (generation failed, nothing running) can be deleted. |
| Approved | Approved requests have already left Requests and drafts and have no Delete draft. If someone approves it while the dialog is open, the server rejects the delete and nothing changes. D11 shows in the dialog, **Delete draft** is removed, and **Cancel** closes the dialog. |
| Soft delete | Confirming sets status `withdrawn` in one guarded write. Row and private media stay; private media stays private. Withdrawn requests never appear on Requests and drafts or in "Similar in the library and drafts" drafts. |
| Who can delete | Any practitioner who can review the draft, including someone else's request (Diadem answer 4). |
| Notification | None. The requester is not told when someone else deletes their request (Diadem answer 3). |
| Undo | None. The dialog says so (D4). |
| Success from review page | The dialog closes, the app goes to **Requests and drafts**, and toast D5 shows. |
| Success from a row | The dialog closes, the row leaves the list, and toast D5 shows. Focus moves to the next row's review button, or the previous row's if it was last, or the page heading if the list is now empty. |
| Empty after the last delete | Existing empty copy **Nothing in progress. Approved exercises are in the library.** No new empty state. |
| Generation started while dialog open | Server rejects (lock held). Nothing changes. The dialog closes and D7 shows under the now disabled Delete draft. |
| Already deleted by someone else | If the delete target is already `withdrawn`, treat it as success for this practitioner: close the dialog, remove the row, show D5. A practitioner who has the review page open when someone else deletes it sees D12 with the existing **Requests** back link on next refresh or action; **Approve**, **Regenerate**, edits and Delete draft are off. |
| Failure | Network or server error: D10 shows in the dialog as `role="alert"` above the buttons. The dialog stays open and **Delete draft** retries. Manual retry only, no automatic retry (shared-load-states rule). |

## States (mockups)

| # | State | What it shows | File |
| -- | -- | -- | -- |
| 01 | review-ready-390 | Ready draft, Delete draft under the toolbar | [01](mockups/01-review-ready-390.png) |
| 02 | review-generating-blocked-390 | Generation running: Delete draft disabled with D7 | [02](mockups/02-review-generating-blocked-390.png) |
| 03 | confirm-from-review-390 | Centred dialog D2, D3, D4, Cancel, Delete draft | [03](mockups/03-confirm-from-review-390.png) |
| 04 | list-rows-390 | Rows with Delete draft; Wall angels (generation running) disabled with D7; Seated hamstring stretch (stuck, nothing running) enabled | [04](mockups/04-list-rows-390.png) |
| 05 | confirm-from-row-390 | Dialog over the list | [05](mockups/05-confirm-from-row-390.png) |
| 06 | deleted-toast-390 | Row gone, toast D5, no Undo | [06](mockups/06-deleted-toast-390.png) |
| 07 | empty-after-last-delete-390 | Existing empty copy with toast D5 | [07](mockups/07-empty-after-last-delete-390.png) |
| 08 | edge-cases-390 | D10, D11, D12, D7 race | [08](mockups/08-edge-cases-390.png) |
| 09 | review-ready-1280 | Delete draft at the right end of the toolbar | [09](mockups/09-review-ready-1280.png) |
| 10 | confirm-from-review-1280 | Centred dialog | [10](mockups/10-confirm-from-review-1280.png) |
| 11 | review-generating-blocked-1280 | Disabled with D7 | [11](mockups/11-review-generating-blocked-1280.png) |
| 12 | list-rows-1280 | Row actions with Delete draft | [12](mockups/12-list-rows-1280.png) |

Full board: [00-board-full.png](mockups/00-board-full.png).

## Copy and accessibility

### Strings

Variant and behaviour approved by Diadem (7:22 PM EST). The wording is Designer picks under Diadem's standing rule (Nov 21, 2026, 12:58 AM EST, verbatim: "going forward please pick something reasonable. only ask me if it's a true product decision that you are unsure about"), recorded on DIDI-1277 comments `fffea71e` and `029bad60`. Not Diadem's words.

| Id | String | Where |
| -- | -- | -- |
| D1 | Delete draft | Review toolbar button, list row button, dialog confirm button |
| D2 | Delete {title}? | Dialog title. `{title}` is the draft title, or the requested name before text exists. Same pattern as the approved "Delete {name}?" (DIDI-1216 Q17) |
| D3 | It comes off Requests and drafts for every practitioner. | Dialog body |
| D4 | You can't undo this. | Dialog body, after D3 |
| D5 | Draft deleted. It left Requests and drafts. | Success toast |
| D7 | You can delete it once the AI finishes drafting. | Under disabled Delete draft while a generation is running; after a lock-held rejection |
| D9 | Delete {title} | Accessible name of the list row Delete draft button (not visible) |
| D10 | Couldn't delete the draft. Try again. | Delete failed |
| D11 | This draft was approved, so it can no longer be deleted. | Approved while the dialog was open |
| D12 | This draft was deleted. It is no longer in Requests and drafts. | Review page after someone else deleted the draft |

D6 (**Undo**) and D8 (**More for {title}**) were exploration only (variants B, C, D) and are not used.

### Reused

**Cancel**, **Requests** (back link), **Approve**, **Regenerate**, **Draft, not approved**, **AI drafting**, **Usually ready in a minute**, **Nothing in progress. Approved exercises are in the library.** (all from `src/ui/copy/exercise-requests.ts`).

### Accessibility

| Element | Markup / behaviour |
| -- | -- |
| Delete draft (review) | `<button>`, visible label D1. Disabled while a generation is running with `disabled` and `aria-describedby` pointing at the D7 line. |
| Delete draft (row) | `<button>`, visible label D1, accessible name D9 so each row's button is unique. Disabled state as above, D7 linked with `aria-describedby`. |
| Dialog | `role="alertdialog"`, `aria-modal="true"`, `aria-labelledby` D2, `aria-describedby` D3 and D4. Focus trap. Initial focus on **Cancel**. Escape closes. |
| Focus return | On Cancel or close, focus returns to the Delete draft button that opened it. On success, see the Behaviour table. |
| Toast D5 | `role="status"`, `aria-live="polite"`, shared toast timing and dismiss. No action button. |
| D10, D11 | `role="alert"` inside the dialog. |
| D7 after a race | Polite; does not steal focus. |
| D12 | `role="alert"` at the top of the review page; focus moves to the **Requests** link. |
| Target size | All Delete draft controls at least 44 by 44 px. |

## Is/was

| Topic | Is | Was |
| -- | -- | -- |
| Deleting a draft | Delete draft on the review page and each list row, after a centred confirm dialog | No way to delete or withdraw a draft |
| What delete does | Soft delete: status `withdrawn`, row and media kept | n/a |
| Blocked | Only while a generation is actually running | n/a |
| Stuck AI drafting request | Can be deleted | Stays on the list with no way out |
| Who can delete | Any practitioner who can review the draft | n/a |
| Requester notification | None | n/a |
| Undo | None | n/a |
| Empty list | Existing empty copy | Same |

## Decisions

1. Variant **A** only (Diadem, 7:22 PM EST, "A"). B, C and D are exploration only.
2. Soft delete via `withdrawn`, confirm step, any practitioner (Diadem answer 4).
3. Blocked only while a generation is actually running; stuck requests can be deleted (Diadem answer 2).
4. No notification to the requester (Diadem answer 3).
5. No Undo; centred dialog at every width.
6. Mobile first at **390 px**; **1280 px** keeps the existing review grid and list layout.
7. No gallery components in the Physio POC (spec and mockups only).

## Build notes

- Endpoint, scope check, lock guard and provider pass-through: [DIDI-1278](https://linear.app/didi-build/issue/DIDI-1278). Blocked on this spec plus DIDI-1275 and DIDI-1276.
- The UI needs to know whether a generation is **actually running** per request, not just `status === "open"`. `RequestsAndDraftsPage` today shows **AI drafting** for every `open` request, so the list item (and the draft view) needs a field such as `generation_in_progress` from the server's generation lock. Enable Delete draft when it is false, whatever the status, as long as the request is not approved or withdrawn.
- The server re-checks the lock on the write and rejects with a conflict when it is held (UI shows D7), rejects approved (D11) and treats already withdrawn as success (D5).
- No requester notification, no Undo endpoint.
- Withdrawn requests are excluded from the in-progress list and from the drafts half of "Similar in the library and drafts".

## Changes

- **Nov 21, 2026**: DIDI-1277. New feature: delete an exercise-request draft, variant A (Diadem, 7:22 PM EST, "A"), blocked only while a generation is actually running, soft delete as `withdrawn`, any practitioner, no notification, no Undo. Strings D1 to D5, D7, D9 to D12. Unblocks [DIDI-1278](https://linear.app/didi-build/issue/DIDI-1278). https://linear.app/didi-build/issue/DIDI-1277
