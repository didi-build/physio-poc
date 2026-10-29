# Exercise requests and AI draft review

Area: app · Feature: exercise-requests

## Purpose

When an exercise isn't in the library, a practitioner requests it. The AI drafts the text from a fixed template plus images and a short video, and any practitioner can review, edit and approve the draft. Only approved exercises are live. This review step exists only for AI-generated content (routines have none).

**Matches Product direction: yes.** Checked against the live DIDI-594 description and its locked Product direction comments (read Oct 25, 2026, after the 7:22 PM ET approval).

## Design source (approved Oct 25, 2026, 7:22 PM ET)

| Component | MagicPath link | Component id | Final revision |
| -- | -- | -- | -- |
| Web app, clickable concept | https://designs.magicpath.ai/v1/lucky-river-3731 | 464510460847341568 | 465225161508020224 |

Diadem approved this revision on Oct 25, 2026, 7:22 PM ET ("v12 is approved"), including the 7 design guesses listed in the routines and programs specs.

## States

| State | What it shows |
| -- | -- |
| Search with similar | "Similar in the library and drafts" on the results page while searching, before the practitioner starts a request. Library matches: "Use this". Drafts in progress: "View draft" |
| No match | "Request a new exercise" form: Exercise (prefilled from the search), "Note for the AI (optional)", "Submit request" |
| Requested | "It isn't in the library or in drafts yet." then AI drafting, "View request" |
| Conflict on save | Only when someone else submitted something similar while this practitioner was filling in the form: page "Someone submitted something similar" with "Use this", "Merge my changes", "Submit anyway", "Back to edit" |
| Requests and drafts | Only in-progress requests and drafts from every practitioner (nothing published). "Requested by" each one; "Review draft" |
| Draft review | Sections with AI fields, images and video, per-field edit, regenerate with a note (counts against the daily cap), Approve |
| Approved | The exercise leaves Requests and drafts, joins the shared library as version 1, and goes straight into the requester's My exercises as new |

## Key copy

- Results: "Similar in the library and drafts"; "These look close. If one fits, use it instead of requesting a new one."
- Form: "None of these? Request a new exercise" (or "Request a new exercise" with no similar results), "The AI drafts it for any practitioner to review and approve.", "Note for the AI (optional)", placeholder "For example: rehab version, supine", button "Submit request".
- Conflict: "Someone submitted something similar"; "While you were adding this, someone submitted something similar. Your request isn't submitted yet."; "Merge my changes adds your name and note to their draft, so there's one request."
- Requests page: "Shared with all practitioners, so nobody requests the same exercise twice."; empty: "Nothing in progress. Approved exercises are in the library."
- Approve toasts: "Approved. It left Requests and drafts, and it is in your My exercises as new." / "Approved. It left Requests and drafts. It is in All exercises, and in the requester's My exercises."

## Decisions

1. Request, AI draft, review and approve live only in the web app. The connector can't create or edit exercises; when it can't find one it links to the web app search, prefilled.
2. All practitioners see requests and drafts in progress; any practitioner can approve one, including their own.
3. Similar existing exercises and drafts show on the search results page while searching. The "Use this / Merge my changes" page shows only on save, and only if someone else submitted something similar in the meantime.
4. Requests and drafts lists only work in progress. On approval the exercise goes into the requester's My exercises immediately.
5. No notification to the requester in v1.
6. Media regeneration: 5 per practitioner per day.
7. The review step exists to check AI-generated content only.

## Mockups

All states are rendered from the approved web revision 465225161508020224 (unchanged in v11 and v12).

| State | Phone (390 px) | Desktop (1280 px) |
| -- | -- | -- |
| 01 search similar draft in progress | [phone](mockups/01-search-similar-draft-in-progress-phone.png) | [desktop](mockups/01-search-similar-draft-in-progress-desktop.png) |
| 02 no match request form | [phone](mockups/02-no-match-request-form-phone.png) | [desktop](mockups/02-no-match-request-form-desktop.png) |
| 03 request submitted | [phone](mockups/03-request-submitted-phone.png) | [desktop](mockups/03-request-submitted-desktop.png) |
| 04 conflict on save | [phone](mockups/04-conflict-on-save-phone.png) | [desktop](mockups/04-conflict-on-save-desktop.png) |
| 05 conflict merged into their draft | [phone](mockups/05-conflict-merged-into-their-draft-phone.png) | [desktop](mockups/05-conflict-merged-into-their-draft-desktop.png) |
| 06 requests and drafts | [phone](mockups/06-requests-and-drafts-phone.png) | [desktop](mockups/06-requests-and-drafts-desktop.png) |
| 07 draft review | [phone](mockups/07-draft-review-phone.png) | [desktop](mockups/07-draft-review-desktop.png) |
| 08 draft approved | [phone](mockups/08-draft-approved-phone.png) | [desktop](mockups/08-draft-approved-desktop.png) |
| 09 approve own request | [phone](mockups/09-approve-own-request-phone.png) | [desktop](mockups/09-approve-own-request-desktop.png) |

## Locked Product direction (verbatim from DIDI-594)

**DIDI-594 description, section "Exercise database (decided Oct 23, 2026, Diadem)"** (https://linear.app/didi-build/issue/DIDI-594):

> ## Exercise database (decided Oct 23, 2026, Diadem)
>
> We build our own exercise database instead of using a free library. It grows one exercise at a time, on demand: no batch creation.
>
> * **Search.** Kojo, the first user, searches the web app by name, alias or body region.
> * **Request.** If the exercise isn't there, he starts a request from the web app, optionally with a short note like "rehab version, supine".
> * **AI draft.** The AI fills a fixed text template: name and aliases, body region, equipment, starting position, steps, cues, common mistakes, regressions, progressions, precautions, default sets and reps. It also generates visuals in one consistent style: start and end images and a short looping video. Everything is marked as a draft.
> * **Review.** Kojo approves, edits the text, or asks for a regeneration with a note. Only approved exercises are live. Each record stores who approved it, when, and a version number. Any edit sends it back for review.
> * **v1 scope.** Search, request, review and approve live only in the web app. The MCP connector is read-only: it searches approved exercises and builds programs. When an exercise isn't found, it says so and links to the web app's search, prefilled with that name.
> * **Open.** Pick the visual style and model with a five-exercise test before committing, because AI video often gets joint angles wrong. Kojo's review time is the bottleneck.
> * **Not blocking a program.** A request shouldn't stop Kojo mid-program. Allow a placeholder line (name, sets, reps) that links to the real exercise once it's approved. Confirm this in the architecture step.

**DIDI-594 comment, 2026-10-24 18:43 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (addition: DIDI-827 concept picks)
>
> **Diadem, Oct 24, 2026, 2:35 to 2:43 PM ET (Designer chat, relayed verbatim by Designer under rule 4):**
> 1. "1A: keep both, Edit for everyone plus private Edit my copy"
> 2. "2C: all practitioners see it and any can approve"
> 3. "3C: similar exercises plus a Report duplicate or merge action"
> 4. "4A: live right away as a new version, restorable"
> 5. "5A: the same link shows the latest program"
> 6. "A. and that's when they ideally should use the never expire option."
> 7. "7B: those plus a custom date"
> 8. "8B: yes, with a confirm, and it closes any open link"
>
> | Topic | Locked meaning |
> |---|---|
> | My exercises | Keep both: "Edit for everyone" (open editing of the shared entry) plus a private "Edit my copy", with per-field "Library updated" |
> | Requested exercise before approval | All practitioners see it; any practitioner can approve it |
> | Duplicates | Search and aliases, similar library exercises shown on Request it, plus a Report duplicate or merge action |
> | Regenerated media on an approved exercise | Live right away as a new version, restorable |
> | Editing a shared program | The same link shows the latest program |
> | Reusing a general program | One link per program at a time; close it and create a new one, or set it to never expire (the intended path for general programs) |
> | Expiry choices | 1 week, 30 days, 90 days (default), 1 year, Never, plus a custom date |
> | Deleting a program | Allowed with a confirm; it closes any open link |
>
> No conflicts with earlier locked direction (open editing, any practitioner can request, configurable expiry with never, the program stays after its link closes). Recorded by CTO.

**DIDI-594 comment, 2026-10-24 22:58 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (addition: DIDI-828 answers)
>
> **Diadem, Oct 24, 2026 (Designer chat, relayed verbatim by Designer under rule 4), times ET:**
> - Q1, 5:43 PM (do library edits flow into existing programs): "not automatically updated but they're prompted to either update it or keep their original"
> - Q2, 5:43 PM (restore a deleted program): "2B: yes, for 30 days"
> - Q3, 5:44 PM: "3A: yes, a merge can be undone from history". **Superseded at 5:45 PM:** "wait nevermind. I think for v1 we shouldn't do this because it will complicate things. what if someone used the merged version already? so let's make it permanent"
> - Q3 part two, 6:27 PM: "3 part two: any practitioner can mark Not a duplicate"
> - Q4, 6:45 PM: "when someone is putting in a new one and they click submit we search drafts and existing exercises. if we think it's similar, we suggest to the user. they decide if it's similar enough to use or merge with their changes"
> - Q5, 6:48 PM: "5A: any date from tomorrow, no maximum"
> - Q6, 6:56 PM (AI connector): "build a program, read a program, add/remove/reorder/delete exercises to a program (set parameters), set expiry, publish live. they can *only* delete if there are no exercises in it yet. and when editing a program, there is saving and publishing (aka a publishing it will change the live sent link). publishing a program and deleting a program requires a confirmation step the user needs to explicitly okay"
> - Q7, 6:57 PM: "7B: no notification in V1"
> - Q8, 6:57 PM: "8B: daily cap per practitioner"
>
> | Topic | Locked meaning |
> |---|---|
> | Library edits vs existing programs | Not auto-updated; the practitioner is prompted to update or keep their original |
> | Deleted program | Restorable for 30 days |
> | Duplicate merge | Permanent in V1 (no undo) |
> | Not a duplicate | Any practitioner can mark it |
> | Similar requests | On submit, search drafts and existing exercises; suggest similar ones; the user decides to use one or merge their changes |
> | Custom expiry date | Any date from tomorrow, no maximum |
> | Connector | Build and read programs; add, remove, reorder exercises and set parameters; set expiry; publish live. Delete only an empty program. Edits are saved separately from publishing; publishing changes the live link. Publish and delete need an explicit user confirmation |
> | Requester notification | None in V1 |
> | Media regeneration | Daily cap per practitioner |
>
> **Open (Urgent ticket):** (a) does save-vs-publish also apply to the web app, and does it refine DIDI-827 5A to 'the link shows the latest published version'; (b) is empty-only delete connector-only, with the web app keeping delete-with-confirm (DIDI-827 8B); (c) the media regeneration cap number. Recorded by CTO.

**DIDI-594 comment, 2026-10-24 23:02 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (addition: DIDI-829 answers)
>
> **Diadem, Oct 24, 2026 (Designer chat, relayed verbatim by Designer under rule 4), times ET:**
> - 7:00 PM: "1A: yes, save and publish on both the web app and connector"
> - 7:01 PM: "2C: delete-with-confirm everywhere"
> - 7:02 PM: "3: 5 per practitioner per day"
>
> | Topic | Is | Was |
> |---|---|---|
> | Program edits | Save and publish are separate on both the web app and the connector; a share link shows the latest published version | DIDI-827 5A said only "same link shows the latest program"; save vs publish was stated for the connector only (DIDI-828 Q6) |
> | Deleting a program | Delete with a confirm everywhere (closes any open link, restorable for 30 days) | Connector could only delete empty programs (DIDI-828 Q6, 6:56 PM), now superseded |
> | Media regeneration | 5 per practitioner per day | Daily cap per practitioner, number not set |
>
> All DIDI-829 questions are answered. Recorded by CTO.

**DIDI-594 comment, 2026-10-25 03:01 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (addition: similar-exercise flow, refines DIDI-828 Q4)
>
> **Diadem, Oct 24, 2026, about 10:57 PM ET, MagicPath comment on the DIDI-809 v8 web app, pinned to "Merge my changes" in the similar-matches panel on Submit request (relayed verbatim by Designer under rule 4):**
> "we have the option to merge changes *before* this user started creating the exercise. this form should be shown on the next page when someone is saving the new exercise form and while they were creating it another person submitted first. if there is something similar during this search, it should be shown on the results page"
>
> | Topic | Is | Was |
> |---|---|---|
> | Similar existing exercises and drafts | Shown on the search results page while the practitioner searches, before they start a new exercise | Shown on Submit of the new exercise form (DIDI-828 Q4, 6:45 PM) |
> | Use this / Merge my changes | Shown on the next page only when saving the new exercise form, and only if someone else submitted something similar while this user was filling it in | Shown on Submit for any similar match |
>
> This is Diadem's own later refinement of the same point, so it supersedes the Q4 placement; no maintainer ticket is needed. Recorded by CTO.

**DIDI-594 comment, 2026-10-25 04:35 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (addition: v9 MagicPath comments #15, #17, #18)
>
> **Diadem, Oct 25, 2026, about 12:20 to 12:32 AM ET (times approximate), MagicPath comments on the DIDI-809 v9 web app, relayed verbatim by Designer under rule 4:**
> - #15, about 12:24 AM, on the 'Ready to share?' / Share program card on Build program: "we don't need to have this be because when you click "publish" it is essentially sharing the program"
> - #17, about 12:29 AM, near the Build program save area: "product decision: we should auto save"
> - #18, about 12:31 AM, on Requests and drafts: "honestly, since after an exercise that you requested gets approved becomes community exercises, these exercises should no longer be found in the requests and drafts section. only in progress requests and drafts (nothing published). however, product decision, once an exercise you requested gets approved, it will immediately go up your library"
>
> | Topic | Is | Was |
> |---|---|---|
> | Sharing a program | No separate share step; Publish is the share action (with its explicit confirm) | A separate 'Ready to share?' / Share program card on Build program |
> | Saving program edits | Edits save automatically; publishing stays a separate, confirmed step that changes the live link (DIDI-829 1A still holds) | Manual Save draft plus Publish |
> | Requests and drafts | Only in-progress requests and drafts (nothing published) | Also listed approved requests |
> | Approved request | Goes into the requester's library immediately on approval | Not specified |
>
> No conflict with the locked block: #17 changes how saving happens, not the save-vs-publish split. Recorded by CTO.

**DIDI-594 comment, 2026-10-25 21:32 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> **Product direction lock: routine review step (Diadem, Oct 25, 2026, 5:32 PM ET, via Designer, v11 Q2 for DIDI-852):**
>
> Asked: "New routines and community edits currently go live straight away as a new version, with a 'What changed?' note. Should they go through review first, like exercise requests do?"
>
> > "the review step is there to review AI generated content. since the routines are not generating content, we don't need a review step. but the save draft/publish/versions/etc should behave the same as exercises"
>
> | Case | Behaviour |
> | -- | -- |
> | New routine or community edit | No review step; it publishes as a new version with a "What changed?" note |
> | Save draft, publish, versions | Same as exercises |
> | Review step (exercises) | Exists only for AI-generated content |
>
> **Is/was:** was: the v11 draft published directly, and whether review applied was open. Is: no review for routines, and draft/publish/versions match exercises. No conflict with earlier direction.

## Copy inventory (verbatim from the approved source)

Every user-facing string in the parts of the approved source that render this feature, in source order. `{...}` marks a value filled in at runtime (a name, a count, a version, a date). Sample data (exercise names, program names, dates) is example content, not copy.

### Screens and sheets

- Back to your request
- New exercise request
- Someone submitted something similar
- While you were adding this, someone submitted something similar. Your request isn't submitted yet. Use theirs, merge your changes into it, or submit yours anyway.
- Your request
- Note: {conflict.note}
- Submitted while you were adding
- Draft
- AI drafting
- Use this
- Using {r.name}. Your request wasn
- Using {r.name}. Your request wasn't submitted.
- Merge my changes
- Merge my changes adds your name and note to their draft, so there's one request.
- Submit anyway
- Back to edit
- Requests and drafts
- Requests in progress from every practitioner. Any practitioner can review a draft and approve it. Once approved, it leaves this list, joins the shared library and goes straight into the requester's My exercises.
- Shared with all practitioners, so nobody requests the same exercise twice.
- Nothing in progress. Approved exercises are in the library.
- Draft, not approved
- Approved v1
- Requested by
- Approved by
- Review draft
- Review and approve
- Usually ready in a minute
- View in library
- Copenhagen plank, short lever
- Approved. It left Requests and drafts, and it is in your My exercises as new.
- Approved. It left Requests and drafts. It is in All exercises, and in the requester's My exercises.
- Text, images and video
- Images only
- Start and end images. Text and video stay.
- The 6s loop. Text and images stay.
- Saved as version {version + 1} for every practitioner. Version {version} is kept in history.
- New {scopeLabel(scope)} live as version {version + 1} for every practitioner. Version {version} can be restored from history.
- Generating
- Copenhagen plank, short lever, {label.toLowerCase()}
- Regenerate {label.toLowerCase()} image
- Regenerating everything. This takes about a minute.
- Regenerating the {scopeLabel(busyScope)}. Everything else stays usable.
- Text, images and video updated.
- Video updated.
- Both images updated.
- Start image updated.
- End image updated.
- Requests
- It is in your My exercises, tagged New, and no longer in Requests and drafts.
- It went straight into the requester's My exercises, tagged New, and no longer shows in Requests and drafts.
- Add to Knee rehab, week 1
- Draft, not approved.
- Approve
- Regenerate
- Edit all
- Approving records who approved it, the date and the version.
- Previous version kept.
- Undo
- Keep
- Keep new version
- Images
- Choose image
- Start position
- End position
- Swipe to see the end position.
- AI video, 6s loop
- Exercise details
- Basics
- Versions and cues
- Starting position
- Approving records who approved it, the date and the version. Every practitioner sees who requested and who approved it.
- Add to program
- Regenerate start image
- Regenerate end image
- Only this image changes. The rest of the draft stays as it is.
- Choose what the AI should redo. Your edits to anything else are kept.
- Regenerate this image
- Regenerate everything
- Regenerate images
- Regenerate video
- What to regenerate
- Note for the AI
- (optional)
- For example: show forearm support, not straight arm
- Show forearm support, not straight arm
- Hips higher
- Lower bench
- You can undo afterwards. The previous version is kept.
- : updated ?
- Save
- Cancel
- Edit {label}
- Rewritten by AI
- Move item {i + 1} up
- Move item {i + 1} down
- Remove item {i + 1}
- Add item

### Toasts and messages from app logic

- AI draft ready to review: Copenhagen plank, short lever
- Also called "{query.trim()}"
- Your changes were added to the {name} draft. No new request.


## Changes

- **Oct 23, 2026**: First concept: search, no result, request, draft review directions A, B and C; direction A kept. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: Any practitioner can see and approve a request; requested by and approved by. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-827
- **Oct 24, 2026**: Similar exercises on submit, Merge my changes, no requester notification, regeneration cap. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-828, https://linear.app/didi-build/issue/DIDI-829
- **Oct 25, 2026**: v9 comment #12: similar results move to the search results page; conflict page only on save. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v10 comment #18: Requests and drafts shows only work in progress; approved requests go straight into My exercises. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v12 approved by Diadem (7:22 PM ET). No change to this feature in v11 or v12. https://linear.app/didi-build/issue/DIDI-809
