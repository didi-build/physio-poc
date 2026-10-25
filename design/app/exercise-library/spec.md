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

Main nav, in this order: **Exercises / Routines / Programs / Requests** (desktop top bar labels: Exercises, Routines, Programs, Requests and drafts; phone bottom bar: Exercises, Routines, Programs, Requests, with a count badge on Requests). There is no global search: each page has its own search bar.

## States

| State | What it shows |
| -- | -- |
| My exercises | Tabs "My exercises" / "All exercises" right under the "Exercise library" heading. Sections: New from your requests, Pinned, Recently used and saved. Rows show "Edited" and "Library updated" tags |
| All exercises | Every approved exercise, with "Used N times" and attribution |
| Search | Name, alias or body region. A matched alias is shown ("Matched alias:") |
| Filters & sort | Collapsible, collapsed by default. Header shows a count of active filters and a one line summary when collapsed. Inside: Body region pills, Type dropdown, Sort (Most used, Newest, A to Z), Reset, Done |
| Type dropdown | Strengthening & stretching (default), Strengthening (Isometric, concentric, eccentric), Stretching (Hold a stretch). One type always stays on |
| No exact match | "No exact match for ..." with "Similar in the library and drafts" (library matches: Use this; drafts: View draft) and the request form underneath (see exercise-requests) |
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

- **Oct 23, 2026**: First concept: search, request, AI draft review, builder, share. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: Shared library and My exercises; open editing with "Edit for everyone", version history and restore; private "Edit my copy" with "Library updated". https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-825
- **Oct 24, 2026**: DIDI-827 picks: keep both edit paths; similar exercises plus Report duplicate or merge; regenerated media live as a new version. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-827
- **Oct 24, 2026**: DIDI-828 and DIDI-829 answers: merges permanent, Not a duplicate, regeneration cap 5 per day. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-828, https://linear.app/didi-build/issue/DIDI-829
- **Oct 24, 2026**: v9 comments #9 to #11: tabs under the heading, type filter, legend in the filter. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v10 comments #13 and #16: Type dropdown; collapsible Filters & sort with Sort. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v11: nav renamed to Exercises / Routines / Programs / Requests. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-852
- **Oct 25, 2026**: v12 approved by Diadem (7:22 PM ET). No change to this feature in v12. https://linear.app/didi-build/issue/DIDI-809
