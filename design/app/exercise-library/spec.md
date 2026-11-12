# Exercise library

Area: app · Feature: exercise-library

## Purpose

One shared exercise library for every practitioner, plus My exercises: each practitioner's saved, pinned and privately edited view of it. Any practitioner can improve a shared exercise for everyone (open editing, wiki style, with version history), keep private edits in their own copy, report and merge duplicates, and regenerate media. Kojo is the only real user in the MVP but uses it as a regular practitioner.

**Matches Product direction: yes.** Checked against the live DIDI-594 description and its locked Product direction comments (read Oct 25, 2026, after the 7:22 PM ET approval).

## Design source (approved Oct 25, 2026, 7:22 PM ET)

| Component | MagicPath link | Component id | Final revision |
| -- | -- | -- | -- |
| Web app, clickable concept | https://designs.magicpath.ai/v1/lucky-river-3731 | 464510460847341568 | 465225161508020224 |

Diadem approved this revision on Oct 25, 2026, 7:22 PM ET ("v12 is approved"), including the 7 design guesses listed in the routines and programs specs.

## Navigation (whole app)

Main nav, in this order: **Exercises / Routines / Programs**. Desktop top bar and phone bottom bar have these three entries only. Requests is not a primary nav tab at either size. There is no global search: each page has its own search bar.

Requests moves to the existing top-right account dropdown opened by the account chip (the approved reference fixture shows "Kojo"). Reuse "Requests" on phone and "Requests and drafts" on desktop, the existing short and full nav labels. Put the relocated entry immediately after the identity line and before My defaults; keep My defaults ("Types, links") and Sign out unchanged. Opening the menu, closing it, focus behavior and selecting an item retain the existing account-menu contract. Selecting Requests reaches the existing Requests and drafts route; the request/review screens (DIDI-1009) do not change.

The amber drafts-to-review count moves with the Requests entry into the dropdown. Keep its existing numeric format and visibility rule: display the integer only when greater than 0; omit the badge at 0. No new count wording, suffix, cap or separate account-chip badge. The count data and meaning do not change. Any additional screen-reader count wording belongs to DIDI-1114 and is not introduced by this relocation.

At 390 px, distribute the three bottom tabs equally, retaining the approved bar height, safe-area behavior, labels, SVGs, active/inactive states and spacing inside each tab. At 1024 px and up, remove Requests and drafts from the top nav and expose it only in the same account dropdown. Existing Requests and review routes no longer select any of the three primary tabs. Do not rename or redesign any content.

The three remaining phone icons reuse the approved v12 paths `I.library`, `I.routine`, `I.programs` in `design/reference/web-app/generated/WebAppClickableConcept.tsx`: 22 px, stroke 1.8 inactive / 2.1 active, teal-50 active pill. Remove `I.inbox` from the bottom bar with the Requests tab. Visible labels name the tabs; icons remain hidden from assistive technology. The Requests account-menu row MUST retain the existing `I.inbox` icon, as approved by Diadem on Nov 6, 2026, 1:52 AM ET (America/Toronto). Use the existing 20 px inbox SVG and menu-row styling shown in the approved phone and desktop mockups. Keep the three bottom tabs on approved v12 icons for now. Any A/B/C tab-icon change is explicitly deferred to DIDI-1114: "Revisit the tab icons in DIDI-1114". The inbox menu icon and current v12 tab icons are settled for DIDI-1173, not open questions or approval gates.

DIDI-1173 is the final approved navigation spec, approved by Diadem in Designer's chat on Nov 6, 2026, 1:52 AM ET (America/Toronto), ready for a design-spec PR. DIDI-1175 remains Blocked until this approved spec is merged and its merge commit and paths are linked. Physio's gallery waiver in DIDI-998 still applies; CTO must reconcile the stale gallery wording in DIDI-1173 / DIDI-1175, not add a new gallery gate.

Account identity wiring belongs to DIDI-1172. "Kojo" and "Signed in as Kojo, physiotherapist" are unchanged approved reference-fixture text here, not a requirement to hard-code the production identity. The latest DIDI-594 lock requires the authenticated Google session identity.

## States

| State | What it shows |
| -- | -- |
| My exercises | Tabs "My exercises" / "All exercises" right under the "Exercise library" heading. Sections: New from your requests, Pinned, Recently used and saved. Rows show "Edited" and "Library updated" tags |
| All exercises | Every approved exercise, with "Used N times" and attribution |
| Search | Name, alias or body region. A matched alias is shown ("Matched alias:") |
| Filters & sort | Collapsible, collapsed by default. Header shows a count of active filters and a one line summary when collapsed. Inside: Body region pills, Type dropdown, Sort (Most used, Newest, A to Z), Reset, Done |
| Type dropdown | Strengthening & stretching (default), Strengthening (Isometric, concentric, eccentric), Stretching (Hold a stretch). One type always stays on |
| No exact match | "No exact match for ..." with "Similar in the library and drafts" (library matches: Use this; drafts: View draft) and the request card underneath, Exercise prefilled from the search. With no similar results, the message sits inside the request card (see "DIDI-1200: Request card on All exercises empty states") |
| All exercises empty | No search and 0 exercises, or no search and the filters match nothing: the request card with an empty Exercise field (DIDI-1200) |
| My exercises empty | Unchanged, no request card: the message, "Try All exercises, or request it there." and "Search all exercises" (DIDI-1200; which message is DIDI-1057) |
| Exercise details | Images and video, steps, cues per type, version, "Edit for everyone", "Edit my copy", "History (N)", "Report duplicate or merge", "Regenerate" with the daily count left |
| Edit for everyone | Shared entry editor. Saving makes version N+1 for every practitioner; optional "What did you change?" note; "Changed" badges |
| Version history | Every version with who, date, summary and changes; "Restore this version" with a confirm; restoring saves as a new version; merges are permanent |
| My copy | Private per-field edits on top of the library entry. When the library changes a field you edited: "Library updated" with "Use library version" / "Keep mine". "Remove from My exercises" with Undo |
| Report duplicate / merge | Two steps: "Which one is it the same as?" then "Which one stays?". Report only adds a "Possible duplicate" note anyone can merge or dismiss ("Not a duplicate"). Merge needs a confirm and is permanent |
| Regenerate media | Sheet; goes live right away as a new version, restorable. Cap: 5 per practitioner per day, then a limit-reached state |
| Approved from your request | The newly approved exercise appears at the top of My exercises under "New from your requests" |

## Key copy

- Heading "Exercise library"; tabs "My exercises", "All exercises".
- My exercises description: "Exercises you saved or used in a program. Pin your favourites to keep them on top."
- Search placeholder: "Try: heel slides, SLR, knee" (All exercises), "Search my exercises" (My exercises).
- Filters header: "Filters & sort"; groups "Body region", "Type", "Sort"; buttons "Reset", "Done".
- Toast when the last type is removed: "Showing both types. At least one type stays on."
- No exact match: "These look close. If one fits, use it instead of requesting a new one."
- Request card (All exercises empty states only, DIDI-1200): "None of these? Request a new exercise" with similar results, otherwise "Request a new exercise"; "The AI drafts it for any practitioner to review and approve."; "Exercise"; "Note for the AI (optional)"; placeholder "For example: rehab version, supine"; button "Submit request". No new strings.
- Edit for everyone banner: "This is the shared library entry. When you save, it becomes version N+1 for every practitioner." Button "Save as version N+1" ("No changes yet" until something changes).
- Version history intro: "Every change to the shared entry is kept: text edits, regenerated images and video, and merges. Restoring an older version saves it as a new version, so nothing is lost. A merge can't be undone."
- My copy: "Your edits sit on top of the library exercise. Only you see them. Anything you haven't edited follows the library." Field conflict: "The library changed this after you edited it", buttons "Use library version" / "Keep mine".
- Toasts: "Saved to My exercises" (Undo), "Removed {name} from My exercises" (Undo), "Merged for good. {name} is now version {v}, with the history of both."

The full verbatim copy is in the inventory at the end.

## Decisions

1. One shared library; approved versions are visible to all practitioners; drafts and pending requests to their author and, for review, to all practitioners (see exercise-requests).
2. Open editing for v1: any practitioner can "Edit for everyone"; every save is a new version; any version can be restored as a new version.
3. My exercises is an override layer, not a full copy. Fields you didn't edit follow the latest library version; edited fields keep your value and get a "Library updated" flag with "Use library version" / "Keep mine".
4. Library edits never change existing programs: their builder prompts to update or keep the original (see programs).
5. Duplicates: similar results on search, plus Report duplicate or merge. Merges are permanent in v1. Any practitioner can mark "Not a duplicate".
6. Regenerated media goes live right away as a new version, restorable. 5 regenerations per practitioner per day.
7. Type filter is by category only (Stretching, Strengthening) as one dropdown; isometric, concentric and eccentric are picked per program row.
8. Filters & sort are collapsible and collapsed by default; Sort is Most used (default), Newest, A to Z.
9. Browsing never adds to a program: saving from browse adds to My exercises only.
10. No global search.

## Mockups

All states are rendered from the approved web revision 465225161508020224 (this feature did not change in v11 or v12, so these match the last approved look, with the current nav).

| State | Phone (390 px) | Desktop (1280 px) |
| -- | -- | -- |
| 01 my exercises | [phone](mockups/01-my-exercises-phone.png) | [desktop](mockups/01-my-exercises-desktop.png) |
| 02 all exercises | [phone](mockups/02-all-exercises-phone.png) | [desktop](mockups/02-all-exercises-desktop.png) |
| 03 filters and sort open | [phone](mockups/03-filters-and-sort-open-phone.png) | [desktop](mockups/03-filters-and-sort-open-desktop.png) |
| 04 type dropdown open | [phone](mockups/04-type-dropdown-open-phone.png) | [desktop](mockups/04-type-dropdown-open-desktop.png) |
| 05 filters active count | [phone](mockups/05-filters-active-count-phone.png) | [desktop](mockups/05-filters-active-count-desktop.png) |
| 06 search no exact match similar | [phone](mockups/06-search-no-exact-match-similar-phone.png) | [desktop](mockups/06-search-no-exact-match-similar-desktop.png) |
| 07 exercise details | [phone](mockups/07-exercise-details-phone.png) | [desktop](mockups/07-exercise-details-desktop.png) |
| 08 edit for everyone | [phone](mockups/08-edit-for-everyone-phone.png) | [desktop](mockups/08-edit-for-everyone-desktop.png) |
| 09 saved as new version | [phone](mockups/09-saved-as-new-version-phone.png) | [desktop](mockups/09-saved-as-new-version-desktop.png) |
| 10 version history | [phone](mockups/10-version-history-phone.png) | [desktop](mockups/10-version-history-desktop.png) |
| 11 restore version confirm | [phone](mockups/11-restore-version-confirm-phone.png) | [desktop](mockups/11-restore-version-confirm-desktop.png) |
| 12 my copy library updated | [phone](mockups/12-my-copy-library-updated-phone.png) | [desktop](mockups/12-my-copy-library-updated-desktop.png) |
| 13 report duplicate pick match | [phone](mockups/13-report-duplicate-pick-match-phone.png) | [desktop](mockups/13-report-duplicate-pick-match-desktop.png) |
| 14 merge pick which stays | [phone](mockups/14-merge-pick-which-stays-phone.png) | [desktop](mockups/14-merge-pick-which-stays-desktop.png) |
| 15 merge confirm permanent | [phone](mockups/15-merge-confirm-permanent-phone.png) | [desktop](mockups/15-merge-confirm-permanent-desktop.png) |
| 16 merged history | [phone](mockups/16-merged-history-phone.png) | [desktop](mockups/16-merged-history-desktop.png) |
| 17 possible duplicate reported | [phone](mockups/17-possible-duplicate-reported-phone.png) | [desktop](mockups/17-possible-duplicate-reported-desktop.png) |
| 18 regenerate media sheet | [phone](mockups/18-regenerate-media-sheet-phone.png) | [desktop](mockups/18-regenerate-media-sheet-desktop.png) |
| 19 regenerated media live | [phone](mockups/19-regenerated-media-live-phone.png) | [desktop](mockups/19-regenerated-media-live-desktop.png) |
| 20 regenerate daily limit reached | [phone](mockups/20-regenerate-daily-limit-reached-phone.png) | [desktop](mockups/20-regenerate-daily-limit-reached-desktop.png) |
| 21 approved request in my exercises | [phone](mockups/21-approved-request-in-my-exercises-phone.png) | [desktop](mockups/21-approved-request-in-my-exercises-desktop.png) |

## Locked Product direction (verbatim from DIDI-594)

**DIDI-594 description, section "Data model (CTO decision"** (https://linear.app/didi-build/issue/DIDI-594):

> ## Data model (CTO decision, Oct 23, 2026)
>
> The full decision is in the comment of the same date. In short:
>
> * There are four exercise types: stretching, isometric, concentric and eccentric. A stretch exercise is only prescribed as stretching. A strengthening exercise is one library entry that can be prescribed as any of the three strengthening types.
> * The type is picked per program row.
> * Each exercise version has one media set, plus a short cue line per type.
> * Parameters are a validated JSON map with these keys: reps, sets, hold_s, ascent_s, descent_s, rest_s, per_day (a number or a range) and days_per_week.
> * Global defaults per type are seeded by migration. The practitioner's overrides go on a "My defaults" page with "Reset to global".
> * A program row snapshots the resolved params and pins the exercise version.
> * Body regions come from a seeded list and drive the pill filters.

**DIDI-594 description, section "Data model addendum"** (https://linear.app/didi-build/issue/DIDI-594):

> ## Data model addendum: shared library and My exercises (CTO decision, Oct 24, 2026)
>
> Based on Diadem's comments on the <issue id="0c98d085-6f43-4edd-b5d2-1f19587fd0dc" href="https://linear.app/didi-build/issue/DIDI-809/physio-mvp-concept-design-web-app-and-mcp-connector-flows-to-show-kojo">DIDI-809</issue> preview (relayed by Designer). Final once Diadem approves the concept.
>
> * **Shared library.** Exercises belong to one shared library. `exercises` gets `created_by` (practitioner_id). Every approved version is visible to all practitioners; drafts and pending requests are visible only to their author. The requester approves their own AI draft (same review flow as before). No per-exercise privacy setting in the MVP. Kojo is still the only user, so there's still single-user sign-in in the MVP; the model just doesn't assume one user.
> * **My exercises is an override layer, not a full copy.** `practitioner_exercises`: practitioner_id, exercise_id, favourite (bool), saved_at, last_used_at, `text_overrides` (validated JSON: title, description, cue per type; only the fields they changed) and `param_overrides` (validated JSON keyed by type, same param keys as `type_defaults`). Unique on (practitioner_id, exercise_id). Saving from browse or adding to a program creates the row. Media is never overridden.
> * **Precedence for a new program row's params:** My exercise override for that type, then My type defaults, then global type defaults. Text: my override field, then the library version's field.
> * **New library versions.** My exercises follows the latest approved version. Fields they didn't override update automatically; fields they did override keep their value. When a new version changes a field they've overridden, show a "Library updated" badge with the new text and a per-field "Use library version". Overrides are keyed by type, not by version, so they carry across versions.
> * **Programs stay frozen.** A program row still pins exercise_version_id and snapshots params, and now also snapshots the resolved text (title and cue) at the time it's added, so editing My exercises or a new library version never changes a shared program or PDF.
> * **Type filter.** Library and My exercises filter by category only: Stretching or Strengthening. Isometric, concentric and eccentric are chosen per program row.
> * **Duplicates allowed.** The same exercise can appear in a program more than once, with different types, params or versions. Rows are unique only on (program_id, position); there's no uniqueness on exercise_id.
> * **Browse never adds to a program.** Saving from browse adds it to My exercises only. Rows are added only inside the builder, which searches My exercises first and then the library.

**DIDI-594 comment, 2026-10-24 17:02 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (partial)
>
> **Diadem, Oct 24, 2026, 1:02 PM ET (CTO chat), verbatim:**
> > shared library for multiple practitioners will be in the mvp but he will be the only user. I want to design for this because he as the initial user will be testing how the product works as a regular user
>
> Meaning for design and build: the shared multi-practitioner library (author-only drafts, approved exercises visible to all practitioners, My exercises) is IN the MVP. Kojo is the only real user and tests it as a regular practitioner would. The 'Single user (Kojo)' line on DIDI-809 means one user account, not a single-user data model.
>
> Still open on DIDI-821: the scope table check (draft above) and which assistants the connector must support. Until those are answered, the rest of the draft table stays unlocked paraphrase. Recorded by CTO.

**DIDI-594 comment, 2026-10-24 17:28 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (addition: scope table review)
>
> **Diadem, Oct 24, 2026, 1:28 PM ET (CTO chat), verbatim:**
> > I am reviewing the table now. So for the first row overall, yes. However, it says only for the, only the author sees drafts, plus a My Exercises page for favorites and overrides. I think I, I'm not sure about that. We'll need to think that through a bit more. Like, once a user or practitioner adds it to their set of exercises, they can edit that freely, but who can edit the shared community library? That is an interesting product question because I'm imagining a case where User one creates a bunch of exercises that people need. User two uses it a lot but notices that, like, maybe something was wrong in the global version. User one prob- maybe doesn't use the app anymore, doesn't use it as much, or doesn't have time to maintain all the exercises they created. User two would like, and me as the product owner, would like this broken exercise to be fixed. but now the bottleneck is the original person who submitted it to the community exercise library. So, I don't know the right solution right now, but that that is not a trivial question, because again, if Like another, like user two wouldn't be able to just create a new community exercise because, or like they shouldn't, because then that means there are duplicate exercises in the, in the community. Like, it, it, it makes it bad for people to search through. So that's my thoughts on row one. I agree with row two with specifically a practitioner. Like Kojo is just an example of one practitioner who can do this. Then this goes back to the, the previous row where, like, who owns the final community version. the program builder, yes, that, that makes sense. And the last row, that also makes sense.
>
> | Row | Status |
> |---|---|
> | Web app: library and search | Yes overall. **Open:** who can edit the shared community library (author-only drafts and the My exercises override model not confirmed); no duplicate community exercises |
> | Web app: request and AI draft | Yes, for any practitioner (Kojo is one example). **Open:** who owns the final community version |
> | Web app: program builder | Yes, locked |
> | Web app: share (link or PDF, 90-day expiry) | Not yet commented on |
> | Connector (ChatGPT and Copilot first, then Grok and Claude) | Yes, locked. Still open: 'read-only' wording vs program writes |
>
> The community library edit and ownership question is a product call, tracked as its own Urgent Ready for maintainer ticket. Recorded by CTO.

**DIDI-594 comment, 2026-10-24 17:38 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (addition: library editing and share)
>
> **Diadem, Oct 24, 2026, 1:38 PM ET (CTO chat), verbatim:**
> > Thank you for sending the options for the the open question. I think for version one, we can do open editing. That makes the most sense. And in the future, or like something I'd like to support would be ... With like, if the community prefers certain versions or others, somehow we track that and intelligently display the most used or the most favorited. but that is like a future, like V1 doesn't need to have that intelligent suggestion. It just should be the open editing. And link or PDF, as long as someone can create a PDF from the link, the link is at the bare minimum all we need for V1. But if we can already support having the PDF from the link, it shouldn't be too much of a lift after to have the lift, to have the PDF natively shared as well. 90-day expiry, but it should be a configurable value. Some practitioners would like it to be one week, or some would want it to be per patient. So 90-day defaults, but could have practitioner de-set defaults, as well as a per patient, or like, not per patient, but per program setting. And yes for deleteable. By "deletable," do you mean closing the share, like the, the share routes, like closing it from other people, or do you mean the practitioner can no longer use and utilize it? Because those are two separate things. I think the practitioner would like some of them to be, like, always available. for example, if they just have a, a very universal program, then they would want to, like, reuse that with different patients.
>
> | Row | Locked meaning |
> |---|---|
> | Shared library editing (DIDI-825) | V1: open editing by any practitioner (wiki style, with version history). Future, not V1: track which versions the community prefers and surface the most used or favourited |
> | Share | V1 minimum: a link, from which a PDF can be made. Native PDF sharing is a small follow-on |
> | Link expiry | Default 90 days. Configurable: a practitioner-set default, plus a per-program setting |
> | Deletable | Yes. CTO's meaning: closing the share link so others lose access; the program itself stays for the practitioner to reuse with other patients. Pending Diadem's confirmation, plus whether 'always available' means a link that never expires |
>
> Still open: the connector 'read-only' wording vs program writes. Recorded by CTO.

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

**DIDI-594 comment, 2026-10-25 20:37 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (Search: global search proposed, then WITHDRAWN)
>
> **Diadem, Oct 25, 2026, 4:36 PM ET (Designer chat, about DIDI-809, relayed verbatim by Designer under rule 4):** "One more thing, when you redesign, when you do the redesign so each, like the exercise library and the programs will have a, like, search bar on each page. There should also be a search bar, like, a consolidated one, so that when they open the app, they can just search anything and it will show up. It will bring up exercises, routines, and programs, so they can just, like, very quickly search anything."
>
> **Diadem, 4:37 PM ET (verbatim):** "wait nevermind". Designer asked "Never mind which part?"; Diadem: "Drop the global search"
>
> | Topic | Is | Was |
> |---|---|---|
> | Search | No global search; each page keeps its own search bar, as already designed | Same (4:36 PM proposal withdrawn at 4:37 PM) |
>
> Global search removed from the description table, DIDI-852 and DIDI-853. Recorded by CTO.

**DIDI-594 comment, 2026-10-25 21:29 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> **Product direction lock: saved routine copies and community updates (Diadem, Oct 25, 2026, 5:29 PM ET, via Designer, v11 Q1 for DIDI-852):**
>
> Asked: "When a practitioner saves a community routine to My routines, should their saved copy follow later community updates, or stay frozen as it was when they saved it?"
>
> > "it should behave the same way as the exercises. stay frozen but flag the update and make it easy to adopt the changes"
>
> | Case | Behaviour |
> | -- | -- |
> | Practitioner's saved copy in My routines, community routine later updated | Copy stays frozen; it shows a flag that an update exists, with an easy way to adopt the changes |
> | Same rule for exercises | Yes, routines match the exercise library behaviour |
>
> **Is/was:** was: not specified beyond "library rules like the exercise library" (Q3, 4:23-4:35 PM). Is: saved copies stay frozen, are flagged on community updates, and adopting is easy. No conflict with earlier direction; patient program copies are still edited one at a time, with no push (Q2b).

**DIDI-594 description, entry I, "Request-exercise card on every empty Exercises state, flattened" (LOCKED, Nov 10, 2026)** (https://linear.app/didi-build/issue/DIDI-594), verbatim:

> **I.** Diadem, directly in CTO's chat, Nov 10, 2026, 1:25 PM EST, about the Exercises page:
>
> "1) requesting a new exercise only shows up if there is something being searched. it makes sense to me if this shows up for any empty state (even when nothing is being searched)
>
> 2) visually, there are too many embedded layers (form inside a form inside a form)"

Diadem, Nov 10, 2026, 2:07 PM ET, DIDI-594 entry I update 1 (is/was comment 93487fc0), picking variant C on DIDI-1200, verbatim: "C, however, this should only display on the "all exercise" tab (not my exercises)"

Diadem, Nov 10, 2026, 2:09 PM ET, DIDI-594 entry I update 1 (is/was comment 93487fc0), answering "Approve C2 for the spec?", verbatim: "Yes, approve C2"

| Topic | Was | Is |
| -- | -- | -- |
| When the request card shows | Only on All exercises when a search finds no exact match | On every All exercises empty state: search with no exact match, no search with 0 exercises, no search with filters that match nothing. Not on My exercises (2:07 PM) |
| Exercise field | Read-only, the search text | Editable. Prefilled from the search when there is one; empty when there is no search |
| Card nesting | Dashed card around a shaded box around a read-only Exercise box | One container (variant C2) |

## Copy inventory (verbatim from the approved source)

Every user-facing string in the parts of the approved source that render this feature, in source order. `{...}` marks a value filled in at runtime (a name, a count, a version, a date). Sample data (exercise names, program names, dates) is example content, not copy.

### Screens and sheets

- Exercise library
- My exercises
- All exercises
- Exercises you saved or used in a program. Pin your favourites to keep them on top.
- Search exercises
- Search my exercises
- Try: heel slides, SLR, knee
- Clear
- All regions
- Body region
- Type
- Close type list
- Sort
- Reset
- Done
- New from your requests
- Pinned
- Recently used and saved
- Browse all exercises
- No saved exercises with these filters
- Nothing in My exercises matches "{query}"
- Try All exercises, or request it there.
- Search all exercises
- Similar in the library and drafts
- In library
- Use this
- Using {e.name}. No request made.
- Draft
- AI drafting
- View draft
- Exercise
- Note for the AI
- (optional)
- For example: rehab version, supine
- Submit request
- Concept demo:
- another practitioner submits something similar while you fill this in.
- for
- to save to My exercises.
- These look close. If one fits, use it instead of requesting a new one.
- It isn't in the library or in drafts yet.
- The AI is writing a draft with images and a short video. Every practitioner can see it in Requests, and any of them can review and approve it. Then it joins the shared library.
- View request
- None of these? Request a new exercise
- Request a new exercise
- The AI drafts it for any practitioner to review and approve.
- Marked as not a duplicate. The note is removed for every practitioner.
- Saved as version {v} for every practitioner. Programs that use it get a prompt to update or keep their original.
- Reported. Both exercises now show a possible duplicate note to every practitioner.
- Version {ver.v} restored as version {v}. Nothing was deleted.
- Merged names stay as aliases. Merges are permanent
- Restored version {ver.v}
- Text, images and video set back to version {ver.v}
- See more details
- In my exercises
- Remove
- Add to my exercises
- Start
- End
- Also called
- Equipment
- Edit my copy
- To use it in a program, open a program and tap Add exercise.
- Library
- A practitioner reported it. Any practitioner can merge them (permanent) or mark it as not a duplicate.
- Merge them
- Not a duplicate
- Shared library entry
- Any practitioner can improve it. Each save becomes the next version for everyone, and older versions can be restored.
- Edit for everyone
- Report duplicate or merge
- Images and video
- Daily limit reached.
- Start position
- End position
- How to do it
- Every strengthening exercise has all 3. You pick one on each program row.
- Stretch exercises have one version, Stretching.
- Cue:
- Library defaults, including suggested tempo and rest.
- About this exercise
- Body regions
- Added by
- Version
- Last edited
- Visible to
- All practitioners
- Who can edit
- Any practitioner
- Precautions
- General guidance for this exercise. Not specific to any patient.
- My copy
- Private changes only you see. To fix it for everyone, use Edit for everyone.
- No edits yet.
- My notes
- No notes yet.
- Save it to edit the text and set your own defaults for this exercise.
- Regenerate media
- Goes live for every practitioner as version {ex.version + 1}. {regenLeftText(regenLeft)}.
- Regenerate and publish
- What to regenerate
- Start and end images
- The 6s loop
- Everything visual. Text stays
- For example: deeper squat, chair behind
- Edited
- Library updated
- Reset {label} to the library version
- Edit {label}
- The library changed this after you edited it
- Library now:
- Use library version
- Keep mine
- Set for this exercise
- Reads as:
- Description
- Cue, {TYPE_LABEL[t].toLowerCase()}
- Your edits sit on top of the library exercise. Only you see them. Anything you haven't edited follows the library.
- Something wrong for everyone? Edit the library entry
- Changes apply to new programs only. Programs you already built keep the values they were made with.
- Text
- Private to you. Not shown on patient PDFs.
- For example: when you like to use it
- Always from the library, so every copy shows the same media. To change them for everyone, use Regenerate on the exercise details.
- Defaults per type
- Used when you add this exercise to a new program.
- Which values are used
- This exercise, if edited
- My defaults for the type
- Global
- See library details
- Reset all edits to library
- Reset to the library version
- Remove from My exercises
- void; onPublish: (next: Partial
- Merged a request for "{seed.alias}"{seed.note ?
- Changed
- Exercise details
- This is the shared library entry. When you save, it becomes
- history
- and anyone can restore it.
- What did you change?
- Programs that use it aren't updated on their own. Their builder asks whether to update or keep the original. To change images or video, use Regenerate on the exercise details.
- Name
- Separate with commas. Aliases help others find it instead of adding a duplicate.
- Steps, one per line
- Cues per version
- For example: clearer knee cue
- Shown in version history so others know why it changed.
- Only want it different for you? Edit my copy instead
- Cancel
- No changes yet
- Save as version {ex.version + 1}
- Version history
- Every change to the shared entry is kept: text edits, regenerated images and video, and merges. Restoring an older version saves it as a new version, so nothing is lost. A merge can't be undone.
- Live
- Merge, permanent
- Restore this version
- Programs aren't updated on their own. When this changes, programs that use it ask whether to update or keep the original. Merges are permanent and can't be undone.
- Restore version {confirm.v}?
- This doesn't undo the merge. Merged names stay as aliases, because merges are permanent.
- Programs that use it get a prompt to update or keep their original.
- score(e)
- Report duplicate
- Merge into one
- Which one is it the same as?
- Which one stays?
- Search the library
- Most likely
- Report only
- Merge now
- Report only adds a "Possible duplicate" note on both, so any practitioner can merge them later.
- Possible duplicate
- Pick the one to keep. The other is folded into it.
- Exercise to keep
- Keep
- What happens
- The one you keep stays in the library as one entry.
- The other name and its aliases become aliases, so search still finds it.
- The history of both is kept in one version history.
- Programs and share links that used either one keep working.
- It's permanent. A merge can't be undone.
- Back
- Merge
- Merge {dropped.name} into {kept.name}?
- Merge permanently
- Every practitioner will see one exercise,
- Both histories are kept, and the merge is recorded in version history.
- This can't be undone. Programs may already use the merged exercise, so merges are permanent.

### Toasts and messages from app logic

- Today, 7:05 PM
- Link closed
- Oct 25, 2026
- Draft saved. Only you can see it until you publish.
- Change {i + 1}
- Saved to My exercises
- Removed {e.name} from My exercises
- Oct 24, 2026
- Text unchanged
- Regenerated {what}
- New {what} live as version {v} for every practitioner. Version {v - 1} can be restored from history.
- Permanent. A merge can\
- Merged with {drop.name}
- Merged for good. {keep.name} is now version {v}, with the history of both.
- Matched alias:
- New
- Approved from your request
- Used {m.lastUsed}
- Saved {m.savedAt}
- Edited
- Library updated
- Unpin {name}
- Pin {name}
- Save {name} to My exercises


## Changes

* Nov 10, 2026, 2:09 PM ET, DIDI-1200: Diadem approved C2 ("Yes, approve C2"). The Request a new exercise card shows on every All exercises empty state (search with no exact match, no search with 0 exercises, filters that match nothing) as one container, with the empty message inside it when there are no similar results. Exercise is editable: prefilled from the search, empty with no search; Submit request is disabled until it has text. My exercises empty states are unchanged and have no card ("C, however, this should only display on the "all exercise" tab (not my exercises)", 2:07 PM ET). PROPOSED strings: 0. Matches Product direction: yes. https://linear.app/didi-build/issue/DIDI-1200, https://linear.app/didi-build/issue/DIDI-594

* Nov 6, 2026, 1:52 AM ET (America/Toronto), DIDI-1173 final approval in Designer's chat. Diadem's three answers, verbatim:
  1. "I approve moving Requests into the Kojo menu with three bottom tabs"
  2. "Keep the inbox icon on the Requests row"
  3. "Revisit the tab icons in DIDI-1114"
  Locked: Requests in the account dropdown with its existing inbox icon; three bottom tabs retain approved v12 icons for now; any A/B/C tab-icon change is deferred to DIDI-1114. Only the four approved mockups listed below belong in the PR bundle. PROPOSED strings: 0. Matches Product direction: yes.

* Nov 5, 2026, 3:03 PM ET (America/Toronto), DIDI-1173: Diadem's exact direction: 'requests shouldn't be its own tab, it should be found in the top right drop down (when you click "Kojo")'. Requests is removed from phone and desktop primary navigation and moves the existing entry plus numeric badge into the account dropdown. Requests screens, other labels, styles and behavior remain unchanged. Source: locked Product direction on https://linear.app/didi-build/issue/DIDI-594. Earlier four-tab approval is retained as history, not silently erased. Matches Product direction: yes.

- **Oct 23, 2026**: First concept: search, request, AI draft review, builder, share. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: Shared library and My exercises; open editing with "Edit for everyone", version history and restore; private "Edit my copy" with "Library updated". https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-825
- **Oct 24, 2026**: DIDI-827 picks: keep both edit paths; similar exercises plus Report duplicate or merge; regenerated media live as a new version. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-827
- **Oct 24, 2026**: DIDI-828 and DIDI-829 answers: merges permanent, Not a duplicate, regeneration cap 5 per day. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-828, https://linear.app/didi-build/issue/DIDI-829
- **Oct 24, 2026**: v9 comments #9 to #11: tabs under the heading, type filter, legend in the filter. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v10 comments #13 and #16: Type dropdown; collapsible Filters & sort with Sort. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v11: nav renamed to Exercises / Routines / Programs / Requests. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-852
- **Oct 25, 2026**: v12 approved by Diadem (7:22 PM ET). No change to this feature in v12. https://linear.app/didi-build/issue/DIDI-809


## DIDI-1173: Approved Product direction

**Matches Product direction: yes.** Checked against the live DIDI-594 description on Nov 5, 2026, including the locked Nov 5, 2026, 3:03 PM ET (America/Toronto) correction. This exact relocation supersedes the earlier four-tab location only; both historical records remain preserved on DIDI-594.

Diadem, verbatim, Nov 5, 2026, 3:03 PM ET (America/Toronto):

> requests shouldn't be its own tab, it should be found in the top right drop down (when you click "Kojo")

### Copy inventory for this change

All user-facing wording is reused: "Exercises", "Routines", "Programs", "Requests" (phone), "Requests and drafts" (desktop), "Kojo", "Signed in as Kojo, physiotherapist", "My defaults", "Types, links", "Sign out". The amber badge retains its numeric integer format from the reference source. The render fixture count 2 is illustrative, not live data. Existing accessibility names "Main", "Account menu" and "Close menu" come from the reference; the implementation's existing close/focus contract stays unchanged.

PROPOSED strings: 0. All user-facing wording is reused; additional count-accessibility copy is outside DIDI-1173 and deferred to DIDI-1114.

### Approved mockups

Rendered directly from the approved v12 reference TSX and its existing media, not a hand-drawn approximation. Phone viewport and PNG width are 390 px, height 844 px; desktop is 1280 by 900 px. The four-tab before render represents the approved design, not the observed missing-icon bug on live POC. The only changed chrome is the Requests entry point and three-column bar. Count 2 is a render fixture in both before and after states.

| File | State |
| -- | -- |
| [01 before](mockups/didi-1173-01-before-four-tabs-phone.png) | Four-tab before reference, Requests count 2 |
| [02 three tabs](mockups/didi-1173-02-after-three-tabs-phone.png) | Approved three equal bottom tabs on existing v12 icons; Requests no longer in primary navigation |
| [03 phone dropdown](mockups/didi-1173-03-after-account-dropdown-phone.png) | Approved account dropdown with Requests, count 2 and the existing inbox icon |
| [04 desktop dropdown](mockups/didi-1173-04-after-account-dropdown-desktop.png) | Approved desktop primary nav has three entries; Requests and drafts, count 2 and the existing inbox icon in the dropdown |

### DIDI-1114: Explicitly deferred tab-icon work

Diadem's Nov 6, 2026, 1:52 AM ET (America/Toronto) answer is "Revisit the tab icons in DIDI-1114". DIDI-1173 therefore keeps the approved v12 `I.library`, `I.routine` and `I.programs` paths and active/inactive styling for the three bottom tabs. Any A/B/C change is separate work in DIDI-1114 and does not block this approved relocation. DIDI-1173 removes only the Requests bottom-bar icon and retains the existing inbox icon on the Requests menu row, as expressly approved.

DIDI-1114's exploration (comment `8c7b24a6-d542-41f0-b1bf-42d16d285178`, MagicPath project https://www.magicpath.ai/files/466877438648012800) assumed four tabs. Its A/B/C comparison must reflect three remaining tabs when revisited. Browser-title, naming, dark-mode and new count-accessibility wording remain outside DIDI-1173; no new strings or decisions on those topics are introduced here. CTO comment `5cb30102-321f-4e94-9076-c10c0efc6c31` separately permits DIDI-1115 to restore the existing approved v12 icons.

### CTO coordination, not new Product decisions

* Reconcile DIDI-1173 / DIDI-1175's gallery wording with the recorded Physio gallery waiver in DIDI-998. This final approval does not remove the spec-merge and linking gate for implementation.
* Sequence DIDI-1115 icon restoration and DIDI-1175 relocation so neither reintroduces a fourth tab; do not block the approved current-bar icon restoration or this approved relocation on the separate DIDI-1114 title/dark-mode work.
* Coordinate the account-menu touch point with DIDI-1172 so identity follows the Google session. Do not infer impersonation or a data leak from the old Kojo fixture alone.
* On eventual implementation, update the Shared layout and nav-copy lines in `design/README.md`, this `Navigation (whole app)` section, and the stale four-tab line in `design/app/routines/spec.md` together. Historical approved reference TSX and baseline screenshots remain provenance; do not silently overwrite the approved v12 record.

## DIDI-1200: Request card on All exercises empty states

**Matches Product direction: yes.** It follows DIDI-594 entry I update 1 (the card on every empty state, one container), narrowed by Diadem's 2:07 PM ET words to the All exercises tab only. The quotes are under "Locked Product direction" above.

Design: C2, https://designs.magicpath.ai/v1/sparkling-sand-6261 (MagicPath project 470971882498322432, component 470981126777901056, revision 470981126777901057). Approved by Diadem, Nov 10, 2026, 2:09 PM ET: "Yes, approve C2".

### When the card shows

| # | State | Tab | Search | Filters | Card | Exercise field |
| -- | -- | -- | -- | -- | -- | -- |
| 1 | Search with no exact match | All exercises | Yes | Any | Yes | Prefilled from the search |
| 2 | Library empty | All exercises | No | None | Yes | Empty |
| 3 | Filters match nothing | All exercises | No | Active, 0 results | Yes | Empty |
| 4 | My exercises empty | My exercises | No | None | No, unchanged | n/a |
| 5 | My exercises search finds nothing | My exercises | Yes | Any | No, unchanged | n/a |
| 6 | My exercises filters match nothing | My exercises | No | Active | No, unchanged | n/a |

The card never shows when the All exercises list has results and there is no search, or when a search has an exact match (unchanged).

### Layout: one container

The dashed `.ex-request-shell`, the shaded `.ex-request-form` and the read-only `.ex-request-readonly` box are removed. There is one card, and everything sits directly on it:

- Card: white, 1px solid slate-200 (`--shell-slate-200`) border, radius 1rem.
  - Padding: 1rem below 1024 px, 1.5rem from 1024 px.
  - Margin: 1.25rem below the Filters & sort panel (as `.ex-empty`). In state 1 with similar results, 1.25rem below the similar list.
  - Section with `aria-labelledby` on the request heading.
- Lead (the empty message), only when there are no similar results and a message exists (state 1 without similar results: "No exact match for "{query}"" and "It isn't in the library or in drafts yet."):
  - Heading 1rem, weight 600, slate-900.
  - Line 0.875rem, slate-600, 0.25rem below the heading.
  - A 1px slate-100 divider under the lead, with 1rem above and below it.
  - States 2 and 3 have no lead: the card starts with the request heading.
- With similar results (state 1): "No exact match for "{query}"", "These look close. If one fits, use it instead of requesting a new one." and the "Similar in the library and drafts" list stay above the card, unchanged. The card holds only the request.
- Request heading:
  - Text: "None of these? Request a new exercise" with similar results, otherwise "Request a new exercise".
  - Size: 1.125rem, weight 600. When it follows a lead, it is 1rem.
  - Subtext "The AI drafts it for any practitioner to review and approve." is 0.875rem, slate-500, 0.25rem below.
- Fields (a `form`, stacked, gap 0.75rem):
  - Exercise: label "Exercise" (0.875rem, weight 500, slate-700), then an `.ex-input` text field (min height 2.75rem, radius 0.75rem, slate-200 border) 0.25rem below.
  - Note: label "Note for the AI" with "(optional)" in slate-500 and normal weight, then an `.ex-input` with placeholder "For example: rehab version, supine".
  - Submit request: `.ex-primary-btn`, full width of the fields column.
  - Focus: the inputs show a teal-700 border and a 2px teal-700 ring at 30% opacity; the button uses the existing focus ring.

| Width | Arrangement |
| -- | -- |
| Below 1024 px (390 px reference) | One column: lead (if any), request heading and subtext, then fields 1rem below |
| 1024 px and up (1280 px reference) | Two columns inside the card, `grid-template-columns: minmax(0, 0.9fr) minmax(0, 1.1fr)`, gap 2rem. Left: lead (if any), request heading and subtext. Right: the fields, top-aligned with the left column |

### Behaviour

- **Exercise field.**
  - With a search, it starts as the trimmed search text (state 1, and any search that finds no exact match). With no search, it starts empty (states 2 and 3).
  - It is editable. Changing the search resets it to the new search text.
  - It is not focused automatically. Mockup 02 shows the field's focus style only.
- **Submit request** is disabled (`disabled`, opacity 0.5, not-allowed cursor) while the trimmed Exercise value is empty. No error message, so no new string.
- **After submit.** The card content is replaced by the existing submitted panel ("Requested: {name}", "AI drafting", "View request") in the same single container. The existing conflict flow ("Someone submitted something similar") is unchanged.
- **My exercises is unchanged.** No card. Each empty state keeps main's message, "Try All exercises, or request it there." and the primary "Search all exercises" button (`.ex-primary-btn`), which switches to All exercises and carries the search over, as today.

### Copy inventory for this change

No new or changed strings: PROPOSED strings: 0. All wording is reused verbatim from this spec's copy inventory and `src/ui/copy/exercise-library.ts`:
- "No exact match for "{query}""
- "These look close. If one fits, use it instead of requesting a new one."
- "It isn't in the library or in drafts yet."
- "Similar in the library and drafts"
- "In library"
- "Use this"
- "Draft"
- "Requested by"
- "AI drafting"
- "View draft"
- "None of these? Request a new exercise"
- "Request a new exercise"
- "The AI drafts it for any practitioner to review and approve."
- "Exercise"
- "Note for the AI"
- "(optional)"
- "For example: rehab version, supine"
- "Submit request"
- "No saved exercises with these filters"
- "Nothing in My exercises matches "{query}""
- "Try All exercises, or request it there."
- "Search all exercises"

Sample data in the mockups, not copy: "copenhagen plank", "Side plank", "Adductor side plank", "Kojo", the filter summary "Ankle · Stretching · Most used", and the "0" in the All exercises intro.

### Mockups

Rendered from C2 (revision 470981126777901057). Phone PNGs are 390 px wide and desktop PNGs 1280 px wide. Heights follow the content. The app nav bar is not drawn.

| State | Phone (390 px) | Desktop (1280 px) |
| -- | -- | -- |
| 00 C2 all states overview | [phone](mockups/didi-1200-00-c2-all-states-phone.png) | [desktop](mockups/didi-1200-00-c2-all-states-desktop.png) |
| 01 all exercises search no match | [phone](mockups/didi-1200-01-all-exercises-search-no-match-phone.png) | [desktop](mockups/didi-1200-01-all-exercises-search-no-match-desktop.png) |
| 02 all exercises empty no search | [phone](mockups/didi-1200-02-all-exercises-empty-no-search-phone.png) | [desktop](mockups/didi-1200-02-all-exercises-empty-no-search-desktop.png) |
| 03 all exercises filters no match | [phone](mockups/didi-1200-03-all-exercises-filters-no-match-phone.png) | [desktop](mockups/didi-1200-03-all-exercises-filters-no-match-desktop.png) |
| 04 my exercises empty, unchanged | [phone](mockups/didi-1200-04-my-exercises-empty-unchanged-phone.png) | [desktop](mockups/didi-1200-04-my-exercises-empty-unchanged-desktop.png) |
| 05 my exercises search, DIDI-1057 option A, unchanged | [phone](mockups/didi-1200-05-my-exercises-search-didi-1057-a-unchanged-phone.png) | [desktop](mockups/didi-1200-05-my-exercises-search-didi-1057-a-unchanged-desktop.png) |
| 06 my exercises search, DIDI-1057 option B, unchanged | [phone](mockups/didi-1200-06-my-exercises-search-didi-1057-b-unchanged-phone.png) | [desktop](mockups/didi-1200-06-my-exercises-search-didi-1057-b-unchanged-desktop.png) |
| 07 my exercises filters, unchanged | [phone](mockups/didi-1200-07-my-exercises-filters-unchanged-phone.png) | [desktop](mockups/didi-1200-07-my-exercises-filters-unchanged-desktop.png) |

Mockups 00 and 02 show the Exercise field's focus style. That is for reference only; nothing is autofocused. Mockups 04 to 07 record main's My exercises behaviour, so the implementation has a reference that nothing changes there.

### Notes for Developer (DIDI-1201)

All in `src/ui/exercise-library/ExerciseLibraryPage.tsx` unless noted.

- **Show the card.** Render it when `tab === "all"`, the list is loaded and not failed, and either `showNoExactMatch` (:281) is true or there is no search and `allExercises.length === 0`. Keep `tab === "all"`: no card on My exercises.
- **`submitRequest`** (:336-366): stop requiring `trimmedQuery`. Send `requested_name` from the Exercise field's trimmed value, and return early only when that value is empty. Keep `form_opened_at` and the conflict path unchanged.
- **Exercise field state.** Keep it in its own state, seeded from `trimmedQuery` and reset when the search changes (the `searchParams` effect, :253-260).
- **`RequestForm.tsx`.** Replace the read-only `.ex-request-readonly` div (:54-55) with a labelled `.ex-input` (with `htmlFor`). Disable Submit request when the trimmed value is empty. Move the lead message into the card when there are no similar results.
- **CSS** (`src/ui/styles/exercise-library.css`):
  - Retire the nesting: `.ex-request-shell` (:551-557, dashed) and `.ex-request-form` (:559-564, shaded) become one card (solid 1px slate-200, radius 1rem, padding as above). `.ex-request-readonly` (:575-582) is no longer used.
  - Add the 1024 px two-column grid.
- **My exercises.** Leave the My exercises branch (:433-536) as it is, including the primary "Search all exercises".
- **Tests.**
  - The card renders in states 1, 2 and 3.
  - The card does not render in the My exercises states.
  - Exercise is empty with no search and prefilled with one.
  - Submit request is disabled when Exercise is empty.
  - Submitting with no search sends the typed name.

### Open items, not blocking

- **DIDI-1057** (unanswered): which message My exercises shows when a search finds nothing.
  - A: "Nothing in My exercises matches "{query}"" with "Try All exercises, or request it there."
  - B: "No saved exercises with these filters"
  - My exercises has no card either way (mockups 05 and 06).
- **My exercises empty with no search and no filters.** Main shows "No saved exercises with these filters" here, because the ternary at :450-454 has identical branches, and no spec message exists for this case. This change keeps main's behaviour. A dedicated message would need Diadem's approval.
- **"Search all exercises" with no search.** It opens the full All exercises list. When that list has results, the card does not show until a search finds nothing. Not changed here.
