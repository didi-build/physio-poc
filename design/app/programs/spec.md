# Programs

Area: app · Feature: programs (builder, codes, publish sheet, share link, delete and restore)

## Purpose

A program is what a practitioner sends to one patient: approved exercises with a type and doses per row. It is identified by a practitioner-picked program name and a unique code, never by patient details. Programs are built from scratch or from a routine, edited with auto-save, and published to a share link that always shows the latest published version. The patient opens the link (no sign-in) and can save it as a PDF.

**Matches Product direction: yes.** Checked against the live DIDI-594 description and its locked Product direction comments (read Oct 25, 2026, after the 7:22 PM ET approval).

## Design source (approved Oct 25, 2026, 7:22 PM ET)

| Component | MagicPath link | Component id | Final revision |
| -- | -- | -- | -- |
| Web app, clickable concept | https://designs.magicpath.ai/v1/lucky-river-3731 | 464510460847341568 | 465225161508020224 |

Diadem approved this revision on Oct 25, 2026, 7:22 PM ET ("v12 is approved"), including the 7 design guesses listed in the routines and programs specs.

## States

| State | What it shows |
| -- | -- |
| Programs list | Heading "Programs", "New program", its own search ("Search by name or code"), filter pills All / From a routine / From scratch, count when the list is not empty (see list count copy below; no count when empty). Empty list: heading "No programs yet", helper "Start one from a routine or from scratch. You can find it here later by name or code.", the same "New program" button (opens the start sheet). Card: name, code chip, exercise count ("1 exercise · Sent {date}" or "{n} exercises · Sent {date}"; zero-exercise draft card "No exercises yet"), origin ("From routine {name}, v{N}, used as is" or ", then tweaked", or "Built from scratch"), link status, flags ("Not published yet", "Draft changes not published", "N library updates to review"). Recently deleted: section intro, then programs or "No deleted programs." Restore |
| Search | By name, code (with or without "PRG-") or routine name; the matching code is highlighted. No match: "No program matches ..." with "Clear search" |
| New program | Sheet "New program": "From a routine" (pick a routine, then Create program from routine) or "From scratch" |
| Builder | Code chip, required "Program name", origin banner when made from a routine ("From routine: {name}, version {N}" with "View routine"), status card, exercise rows (type, doses, notes, reorder, duplicate, remove, version), Add exercise sheet (My exercises first, then the full library), Delete program |
| Auto-save | No Save button. "Saving..." then "Saved". Save failure (same spot as saving status on phone status card and desktop publish card): status "Not saved", helper "Your latest changes aren't saved yet.", one alert "Not saved. Your latest changes aren't saved yet.", button "Try again" (accessible name "Try saving again"). A failed save retries automatically; "Try again" stays available. While retrying, "Saving..."; on success, "Saved". Publish stays disabled until the latest changes are saved. Unsaved edits when leaving the builder show a warning first (see leave warning). Status: "Not published yet" / "Unpublished changes" / "Published {time}" |
| Sticky publish card | On tablet landscape and desktop (1024 px and up) the publish card floats in the right column; on phones actions sit in the bottom bar |
| Library update prompt | "Library update for {exercise}": "Programs aren't updated on their own. Update it, or keep your original." with "Update to vN" / "Keep my original" |
| Publish to the live link? | Program card (name, code, exercise count); "Program name (required)" field on a first publish or when the program has no name; "First publish" or "Changes since {time}"; Share link with Copy (or "No link yet..." on a first publish or closed link); Link expires (1 week, 30 days, 90 days, 1 year default, Never, Pick a date); "Publish now" / "Not yet" |
| Name required | Empty name: red field, "Add a program name to publish. Use something you will recognise, not the patient's name.", Publish now disabled |
| Use for a patient | From a routine: the copy is created (code, routine name prefilled) and the practitioner lands on the Publish sheet. Publish now creates the link; Not yet keeps it as a draft ("Kept as a draft. Find it in Programs by name or code {code}.") and it shows in Programs as "Not published yet" |
| Sent copy | Opening a sent program from Programs edits only that patient's copy |
| Delete | Sheet "Delete this program?": moves to Recently deleted, restorable for 30 days, closes its share link |
| Share screen | PDF preview made from the link page, Share link, Link page, Download PDF, close link |
| Close link | "Close this share link?": the program stays in Programs; anyone who opens the old link sees "This link was closed"; "Create a new link" later |
| Link page | What anyone with the link sees, no sign-in: latest published version, Save as PDF, Print, expiry line |
| Leave with unsaved edits | Dialog title "Leave without saving?", body "Your latest changes aren't saved yet. If you leave now, you'll lose them.", buttons "Keep editing" (default, focused) and "Leave". Shown only when there are unsaved edits |

## Key copy

- Programs intro: "Each program has a name you pick and a code. No patient details. Find one you already sent by name or code, and edit just that copy."
- Builder name help: "Pick a name you will recognise. With the code {code}, it is how you find this program later. Don't use patient names or anything that identifies them."
- Origin banner: "A separate copy. Edits here change only this program, and later edits to the routine never change it."
- Auto-save note: "Changes save automatically. When you publish, your patient sees them on the same share link. No need to send a new one."
- First publish status: "No share link yet. Publish when it is ready, and you get the link to send."
- Publish sheet: "Publish to the live link?", "Same link as before. Your patient sees this version as soon as you publish.", "No link yet. Publishing creates it, ready to copy and send.", "Filled in from the routine. Change it if you like."
- Toasts: "Published. Your patient sees it on the same link now." / "Published. Your new link is ready to send.", "Deleted {name}. Its share link is closed. Restore it within 30 days.", "Restored {name}. Its link stays closed. Create a new link from Share."
- Link page: "This page always shows the latest published version of your program."
- Programs list empty: "No programs yet"; "Start one from a routine or from scratch. You can find it here later by name or code." No count when the list is empty.
- Recently deleted empty (after the section intro): "No deleted programs."
- List count: the noun follows the total ("1 program", "5 programs", "1 of 1 program", "0 of 1 program", "1 of 5 programs", "0 of 5 programs"). Announce count changes politely.
- Program card exercise count: "1 exercise · Sent {date}" / "{n} exercises · Sent {date}". Accessible: "{n} exercise(s), sent {date}" (the middle dot is hidden from screen readers). Zero-exercise draft card: "No exercises yet".
- Auto-save failure: status "Not saved"; helper "Your latest changes aren't saved yet."; alert once "Not saved. Your latest changes aren't saved yet."; "Try again" (accessible name "Try saving again"). Failed saves retry automatically; publish stays disabled until saved.
- Leave with unsaved edits: "Leave without saving?"; "Your latest changes aren't saved yet. If you leave now, you'll lose them."; "Keep editing" / "Leave".

The full verbatim copy is in the inventory at the end.

## Decisions

1. No patient information anywhere (web app, connector, links, PDFs). A program has a practitioner-picked program name plus a unique code; the name is required to publish.
2. Program paths: from scratch, or from a routine (then tweak). "Use for a patient" makes a separate copy and lands on the existing Publish sheet with the routine name prefilled; Not yet keeps a draft.
3. Edits save automatically; publishing is a separate, confirmed step and is the share action (no separate share step). The link shows the latest published version.
4. One link per program at a time. Closing a link keeps the program to reuse; publishing a program with no open link creates a new link.
5. Retroactive edits: find a sent program by name or code and edit that one copy; no push from routines or library edits. Library updates prompt "Update" or "Keep my original".
6. Delete needs a confirm, closes any open link, and is restorable for 30 days.
7. Link expiry per program (default 1 year): 1 week, 30 days, 90 days, 1 year, Never, or any date from tomorrow (see settings-link-expiry).
8. Each row snapshots its type, doses and text, and pins the exercise version. The same exercise can appear more than once.
9. Programs has its own search bar; there is no global search.

## Design details approved with v12

Approved with v12 (Diadem, Oct 25, 2026, 7:22 PM ET, "v12 is approved", including these design details):

1. The concept opens with the **empty** condition list, since v1 may start with zero conditions. The filled state is labelled "Sample list".
2. "Use version N" replaces the whole saved copy, including the practitioner's own edits (warned in the banner, Undo in the toast). Exercises do this per field; a routine is one list, so it is one action.
3. "Edit for everyone" has no draft step: it saves straight to a new version, like exercise Edit for everyone. Only brand-new routines are drafts.
4. A draft routine can't be used for a patient until it is published. A draft can be discarded (with Undo). A new routine left untouched is dropped on Cancel.
5. On a first publish, the "Publish to the live link?" sheet shows an editable, required "Program name" field under the program card, so the prefilled routine name can be changed.
6. "Use for a patient" uses My copy when the routine is saved, and the community version otherwise. The toggle on the routine switches it.
7. "Remove from My routines" has no confirm, only Undo, the same as "Remove from My exercises".

## Mockups

Changed in v12 (the approved v12 previews): 21 to 25. Rendered from the approved revision for the rest (v11 states 01 to 08 and 26, and earlier states unchanged since v10).

| State | Phone (390 px) | Desktop (1280 px) |
| -- | -- | -- |
| 01 programs list | [phone](mockups/01-programs-list-phone.png) | [desktop](mockups/01-programs-list-desktop.png) |
| 02 search by code | [phone](mockups/02-search-by-code-phone.png) | [desktop](mockups/02-search-by-code-desktop.png) |
| 03 search by routine name | [phone](mockups/03-search-by-routine-name-phone.png) | [desktop](mockups/03-search-by-routine-name-desktop.png) |
| 04 search no match | [phone](mockups/04-search-no-match-phone.png) | [desktop](mockups/04-search-no-match-desktop.png) |
| 05 new program chooser | [phone](mockups/05-new-program-chooser-phone.png) | [desktop](mockups/05-new-program-chooser-desktop.png) |
| 06 pick a routine for new program | [phone](mockups/06-pick-a-routine-for-new-program-phone.png) | [desktop](mockups/06-pick-a-routine-for-new-program-desktop.png) |
| 07 builder from routine | [phone](mockups/07-builder-from-routine-phone.png) | [desktop](mockups/07-builder-from-routine-desktop.png) |
| 08 first publish from routine | [phone](mockups/08-first-publish-from-routine-phone.png) | [desktop](mockups/08-first-publish-from-routine-desktop.png) |
| 09 builder from scratch empty | [phone](mockups/09-builder-from-scratch-empty-phone.png) | [desktop](mockups/09-builder-from-scratch-empty-desktop.png) |
| 10 add exercise sheet | [phone](mockups/10-add-exercise-sheet-phone.png) | [desktop](mockups/10-add-exercise-sheet-desktop.png) |
| 11 builder draft not published | [phone](mockups/11-builder-draft-not-published-phone.png) | [desktop](mockups/11-builder-draft-not-published-desktop.png) |
| 12 builder sticky publish card scrolled | n/a | [desktop](mockups/12-builder-sticky-publish-card-scrolled-desktop.png) |
| 13 autosave saving | [phone](mockups/13-autosave-saving-phone.png) | [desktop](mockups/13-autosave-saving-desktop.png) |
| 14 autosave saved unpublished | [phone](mockups/14-autosave-saved-unpublished-phone.png) | [desktop](mockups/14-autosave-saved-unpublished-desktop.png) |
| 15 library update prompt | [phone](mockups/15-library-update-prompt-phone.png) | [desktop](mockups/15-library-update-prompt-desktop.png) |
| 16 library update kept original | [phone](mockups/16-library-update-kept-original-phone.png) | [desktop](mockups/16-library-update-kept-original-desktop.png) |
| 17 library update applied unpublished | [phone](mockups/17-library-update-applied-unpublished-phone.png) | [desktop](mockups/17-library-update-applied-unpublished-desktop.png) |
| 18 publish confirm changes | [phone](mockups/18-publish-confirm-changes-phone.png) | [desktop](mockups/18-publish-confirm-changes-desktop.png) |
| 19 published same link | [phone](mockups/19-published-same-link-phone.png) | [desktop](mockups/19-published-same-link-desktop.png) |
| 20 publish closed link creates new | [phone](mockups/20-publish-closed-link-creates-new-phone.png) | [desktop](mockups/20-publish-closed-link-creates-new-desktop.png) |
| 21 use for patient lands on publish sheet | [phone](mockups/21-use-for-patient-lands-on-publish-sheet-phone.png) | [desktop](mockups/21-use-for-patient-lands-on-publish-sheet-desktop.png) |
| 21b use for patient publish sheet expiry | [phone](mockups/21b-use-for-patient-publish-sheet-expiry-phone.png) | n/a |
| 22 program name required | [phone](mockups/22-program-name-required-phone.png) | [desktop](mockups/22-program-name-required-desktop.png) |
| 23 not yet kept as draft | [phone](mockups/23-not-yet-kept-as-draft-phone.png) | [desktop](mockups/23-not-yet-kept-as-draft-desktop.png) |
| 24 use for patient published | [phone](mockups/24-use-for-patient-published-phone.png) | [desktop](mockups/24-use-for-patient-published-desktop.png) |
| 25 programs list with draft copy | [phone](mockups/25-programs-list-with-draft-copy-phone.png) | n/a |
| 26 sent copy edit one patient | [phone](mockups/26-sent-copy-edit-one-patient-phone.png) | [desktop](mockups/26-sent-copy-edit-one-patient-desktop.png) |
| 27 delete confirm | [phone](mockups/27-delete-confirm-phone.png) | [desktop](mockups/27-delete-confirm-desktop.png) |
| 28 deleted recently deleted list | [phone](mockups/28-deleted-recently-deleted-list-phone.png) | [desktop](mockups/28-deleted-recently-deleted-list-desktop.png) |
| 29 restored | [phone](mockups/29-restored-phone.png) | [desktop](mockups/29-restored-desktop.png) |
| 30 share screen pdf | [phone](mockups/30-share-screen-pdf-phone.png) | [desktop](mockups/30-share-screen-pdf-desktop.png) |
| 31 share link sheet | [phone](mockups/31-share-link-sheet-phone.png) | [desktop](mockups/31-share-link-sheet-desktop.png) |
| 32 close link confirm | [phone](mockups/32-close-link-confirm-phone.png) | [desktop](mockups/32-close-link-confirm-desktop.png) |
| 33 link closed program kept | [phone](mockups/33-link-closed-program-kept-phone.png) | [desktop](mockups/33-link-closed-program-kept-desktop.png) |
| 34 patient link page | [phone](mockups/34-patient-link-page-phone.png) | [desktop](mockups/34-patient-link-page-desktop.png) |

## Locked Product direction (verbatim from DIDI-594)

**DIDI-594 description, section "MVP scope (Diadem, Oct 23, 2026"** (https://linear.app/didi-build/issue/DIDI-594):

> ## MVP scope (Diadem, Oct 23, 2026; replaces POC scope above where they differ)
>
> **Web app (SaaS)**
>
> * Create a new exercise, AI-assisted, using the request and review flow in Exercise database below.
> * Create an exercise program from selected approved exercises (sets, reps, notes).
> * Share the program as a link or a PDF.
>
> **MCP connector**
>
> * Only the tools needed to create a program: search approved exercises, build or edit a program, get its share link or PDF. No exercise creation in v1.
>
> **Hard rule:** nothing stores patient information, in the web app, the MCP server, share links or PDFs. Programs are identified by our own id and an optional non-identifying title. If Kojo wants a patient name on it, he adds it after downloading, outside our system.
>
> **Assistants (CTO decision, Oct 23, 2026):** one remote MCP server, using Streamable HTTP on a public HTTPS URL, serves Claude, ChatGPT, Grok and Copilot. Kojo uses ChatGPT and Claude, and Diadem uses Grok. Every tool returns a plain text summary plus a share link, which works in every assistant. An inline program card using the MCP Apps standard (renders in Claude, ChatGPT and M365 Copilot; unconfirmed in Grok) is an optional enhancement on top, never the only output. Check ChatGPT plan limits for custom connectors that write (developer mode; full support is in beta for Business and Enterprise) before testing with Kojo.
>
> **Users:** the MVP is Kojo only, to nail down the vision. Use the simplest single-user sign-in.
>
> **Share links:** they expire after 1 year by default (changed Oct 25, 2026 from 90 days; see Product direction Changes below), and Kojo can delete one early. Both are in the MVP.

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

**DIDI-594 comment, 2026-10-24 17:39 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (addition: always available and connector)
>
> **Diadem, Oct 24, 2026, 1:39 PM ET (CTO chat), verbatim:**
> > I meant both. And for the connector, I think that's another misalignment because it was my understanding that the connector will be used to create programs.
>
> | Row | Locked meaning |
> |---|---|
> | Always available | Both: the program stays in the practitioner's library after its link is closed, and share link expiry offers a 'never' option |
> | Connector | Creates programs (and their share links). The 'read-only' description was a misalignment and is retired |
>
> Diadem is sending a screenshot of the original connector direction; it gets traced like the we-met relay misalignment. Recorded by CTO.

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

**DIDI-594 comment, 2026-10-25 20:37 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (Routines: LOCKED)
>
> Diadem's answers, Oct 25, 2026, ET (Designer chat, relayed verbatim by Designer under rule 4): Q1 4:23 PM "First version"; Q2 4:26 PM "So yes, that's a great idea. and he wants it to be traceable and trackable, so he knows once we make the copy of it it should be either associated with a code, and even better, associated with maybe a name or some way for him to quickly look up what program he already sent, or what routine he already sent. So maybe he would like to retroactively update it. So, yes."; Q2b 4:35 PM "A"; Q3 4:35 PM "Yes"; Q4 4:35 PM "Yes". Full questions and the locked table are in the description's Routines subsection.
>
> In short: Routines are in the first version; using one for a patient makes a separate copy; each sent program has a code and a name with quick lookup; retroactive edits apply to one patient copy only; community routines follow exercise-library rules; the connector can search routines and create a program from one; program from scratch and from routine both remain.
>
> One flag: "maybe a name" is read as a non-identifying title because of the hard rule (no patient information stored). If Diadem means the patient's name, that conflicts with the hard rule and needs his call before build.
>
> DIDI-852 and DIDI-853 updated to match. v11 covers DIDI-809 plus DIDI-852. Recorded by CTO.

**DIDI-594 comment, 2026-10-25 20:45 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> **Routines traceability: LOCKED (Oct 25, 2026, 4:45 PM ET, Diadem via Designer)**
>
> Asked verbatim: "When you said each sent copy could have a name for quick lookup, did you mean a name the practitioner gives the program (like 'Knee rehab, week 1'), or the patient's name? We don't store any patient details, so I'd suggest a program name the practitioner picks, plus the code."
>
> Answer verbatim: "Program name the practitioner picks, plus the code"
>
> Is: each sent copy has a practitioner-chosen program name plus a unique code for lookup; no patient name or details are stored. Was: "maybe a name" (4:26 PM), provisionally locked as a non-identifying title pending confirmation. The pending note is resolved; the no-patient-data rule stands. Designer may start v11 (DIDI-809 plus DIDI-852).

**DIDI-594 comment, 2026-10-25 21:33 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> **Product direction lock: program name required to publish (Diadem, Oct 25, 2026, 5:33 PM ET, via Designer, v11 Q3 for DIDI-852):**
>
> Asked: "Right now a patient program can't be published until it has a name ('Use for a patient' fills in the routine's name as a starting point). Should a name be required to publish?"
>
> > "Yes, a program name is required to publish"
>
> | Case | Behaviour |
> | -- | -- |
> | Patient program without a name | Can't be published |
> | "Use for a patient" from a routine | The routine's name is filled in as a starting point, and the practitioner can edit it |
>
> **Is/was:** was: open in the v11 draft. Is: a program name is required to publish. This matches the 4:45 PM naming lock ("Program name the practitioner picks, plus the code"; no patient details).

**DIDI-594 comment, 2026-10-25 21:35 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> **Product direction lock: where "Use for a patient" lands (Diadem, Oct 25, 2026, 5:35 PM ET, via Designer, v11 Q4 for DIDI-852):**
>
> Asked: "When a practitioner taps 'Use for a patient' on a routine, should it publish the patient's program and give them the link right away, or open it as a draft to adjust first?"
>
> > "it should land on this page"
>
> He attached a screenshot of the existing "Publish to the live link?" sheet. It shows the program name and code, the changes, the share link with Copy, the link-expiry choices, and the Publish now / Not yet buttons.
>
> | Case | Behaviour |
> | -- | -- |
> | Tap "Use for a patient" | The patient copy is created and the practitioner lands on the "Publish to the live link?" sheet |
> | Publish now | Publishes the program and gives the share link |
> | Not yet | Keeps the program as a draft (Designer's reading of the sheet, not his words) |
>
> **Is/was:** was: open in the v11 draft. Is: it lands on the existing publish confirmation sheet. No conflict with earlier direction. The name-required lock (5:33 PM) and the 1-year default expiry (4:21 PM) apply on that sheet.

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

## Copy inventory (verbatim from the approved source)

Every user-facing string in the parts of the approved source that render this feature, in source order. `{...}` marks a value filled in at runtime (a name, a count, a version, a date). Sample data (exercise names, program names, dates) is example content, not copy.

### Screens and sheets

- Times per day
- Remove {m.label.toLowerCase()}
- Less {m.label.toLowerCase()}
- More {m.label.toLowerCase()}
- Add parameter
- Cancel
- Programs
- Each program has a name you pick and a code. No patient details. Find one you already sent by name or code, and edit just that copy.
- No programs yet
- Start one from a routine or from scratch. You can find it here later by name or code.
- New program
- Its share link is closed. You can restore it from Recently deleted until Nov 23, 2026.
- Untitled program
- No link yet
- Link closed. Program kept to reuse.
- Not published yet
- Draft changes not published
- Restored. Link closed, create a new one to share.
- Search programs by name or code
- Search by name or code
- Show programs
- From a routine
- From scratch
- 1 program
- 5 programs
- 1 of 1 program
- 0 of 1 program
- 1 of 5 programs
- 0 of 5 programs
- 1 exercise · Sent {date}
- 6 exercises · Sent {date}
- No exercises yet
- Search by the name you gave it or its code, like PRG-2M8D. Routine names work too.
- Clear search
- From routine
- Built from scratch
- Recently deleted
- Restore a deleted program for 30 days. After that it's gone for good. Its old share link stays closed.
- No deleted programs.
- Oct 24, 2026
- Nov 23, 2026
- Restore
- Restored {p.t}. Its link stays closed. Create a new link from Share.
- Build program
- Code {progCode}
- Program name
- Knee rehab, week 1
- A separate copy. Edits here change only this program, and later edits to the routine never change it.
- View routine
- Saving...
- Saved
- Not saved
- Your latest changes aren't saved yet.
- Not saved. Your latest changes aren't saved yet.
- Try again
- Leave without saving?
- Your latest changes aren't saved yet. If you leave now, you'll lose them.
- Keep editing
- Leave
- Unpublished changes
- Published {pub.at}
- No share link yet. Publish when it is ready, and you get the link to send.
- Not live yet. There is no open link. Publish to create one.
- No open link. Publish to create one.
- Your patient sees this version on the share link.
- Not live yet. Your patient still sees the version published {pub.at}.
- Library update for {ex.name}
- Programs aren't updated on their own. Update it, or keep your original.
- Keep my original
- See what changed
- Exercises
- Press and hold the dots to reorder. Use copy to add the same exercise again, for example in a second version.
- No exercises yet. Add exercises from My exercises or the full library.
- Reorder {r.name}, position {i + 1}. Press and hold, then drag. Or use the arrow keys.
- Pending review
- Duplicate {r.name}
- Duplicate
- Remove {r.name}
- Placeholder. It links to the real exercise once you approve the draft.
- Version of {r.name}
- Adjust
- Done adjusting
- Edited
- Changed for this row only
- Reset to default
- Notes for this exercise (optional)
- Each row keeps the values it was added with. Changes to My exercises or My defaults apply to new rows only.
- Add exercise
- Changes save automatically. When you publish, your patient sees them on the same share link. No need to send a new one.
- Delete program
- Publish
- Not published yet. Publishing creates the share link to send.
- There is no link yet. Publish to create one.
- Everything is live. Published {pub.at}.
- Link settings
- Link closed
- Add
- Publish to the live link?
- Not yet
- Publish now
- Done
- Kept as a draft. Find it in Programs by name or code {progCode}.
- (required)
- Add a program name to publish. Use something you will recognise, not the patient's name.
- Filled in from the routine. Change it if you like.
- First publish
- Changes since {pub.at}
- Share link
- No link yet. Publishing creates it, ready to copy and send.
- There is no open link. Publishing creates a new one you can copy and send.
- Copy
- Link copied
- Anyone with the new link sees this version.
- Same link as before. Your patient sees this version as soon as you publish.
- Your patient sees the published version on this link.
- Link expires
- This program only
- Link stops working on
- Any date from tomorrow. There is no latest date.
- Applies to the new link.
- Expiry changes apply to the link right away.
- Delete this program?
- Deleted {title \|\|
- Deleted {title \|\| 'Untitled program'}. Its share link is closed. Restore it within 30 days.
- It moves to
- . You can restore it for 30 days, then it's gone for good.
- It also
- closes its share link
- , so anyone who opens it sees "This link was closed".
- Its share link is already closed.
- This link was closed
- To stop sharing but keep the program, close the link on the Share screen instead.
- Your exercises first, then the full library
- My exercises
- All exercises
- Search exercises
- Search, my exercises first
- Search the full library
- Nothing in My exercises matches.
- From the full library
- Search all exercises
- No approved exercise matches. Request it from the Library.
- New program from a routine
- Pick a routine, then tap Create program from routine. You can tweak everything after.
- Link set to never expire. It works until you close it.
- Link now expires {expiryDate(x)}
- Downloading {title \|\|
- Downloading {title \|\| 'Untitled program'}.pdf
- Saving {title \|\|
- Saving {title \|\| 'Untitled program'}.pdf from the link page
- Start from a routine, or from scratch
- Pick a ready-made routine for a common condition, then tweak it for this patient.
- An empty program for a patient who doesn't fit a routine. Add exercises one by one.
- Pick a version. You can switch it on the row later.
- Add {choose.name}
- Same images and video for every version. Only the parameters and the cue change.
- Version
- Suggested
- default
- Anyone who opens the old link sees a "This link was closed" page. The program stays in Programs, so you can reuse it with another patient.
- Create a new link
- Anyone with the link can view the program and save it as a PDF. No sign-in, no patient details stored.
- The link always shows your latest published version. Edits stay a draft until you publish them.
- Mid December
- End of January
- End of June 2027
- Never expires.
- Good for a general program you reuse. It works until you close it.
- Expires on
- Reusing this program with other patients?
- Set it to Never. Each program has one link at a time.
- Set to Never
- See the link page
- What your patient sees, with Save as PDF
- Download PDF
- The same PDF the link page makes
- The program stays in Programs
- Back to program
- Share program
- PDF preview
- Exercise program
- PRG-7K3Q
- Oct 23, 2026
- Instructions and images added once approved.
- Follow the steps shown in the video at the link.
- Prepared by your physiotherapist. Watch the videos at the link on this page.
- PDF preview, page 1 of 1. Made from the link page.
- Link page
- Share
- Close this share link?
- Close link
- The program stays in Programs. You can reuse it with another patient and create a new link any time.
- Back to share
- Preview of the link page. This is what anyone with the link sees, no sign-in.
- This page always shows the latest published version of your program.
- Save as PDF
- Print
- Start
- End
- Instructions and images are on the way.
- Show images
- This link stays open until your physiotherapist closes it.
- This link works until {exp.date}.

### Toasts and messages from app logic

- Published. Your new link is ready to send.
- Published. Your patient sees it on the same link now.
- Title changed
- Added {r.name}
- Removed {r.name}
- Exercises reordered
- Changed after sending
- No link yet
- Program created from {r.name}. Tweak it, then publish.
- Publish to the live link?
- Untitled program
- Version {old.v} restored as version {v}. Programs already sent did not change.
- Updated {ex.name} to version {ex.version} in your draft. Sets, reps and notes are kept. Publish to show it on the link.
- Duplicated {r.name}. Switch the version on the copy if you need both.
- Programs that used it keep working


## Changes

- **2026-10-30**: DIDI-1134. Diadem approved the copy for empty states, save failure and singular counts (1:39 PM ET) and the leave warning (1:41 PM ET). https://linear.app/didi-build/issue/DIDI-1134
- **Oct 23, 2026**: First concept: builder, share with PDF preview and delete. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: Per-program expiry with Never; closing a link keeps the program; link page with Save as PDF. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: DIDI-827 to DIDI-829: same link shows the latest published version; delete with confirm, restorable 30 days; save and publish separate; library update prompt. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-827, https://linear.app/didi-build/issue/DIDI-828, https://linear.app/didi-build/issue/DIDI-829
- **Oct 25, 2026**: v10 comments #14, #15, #17: sticky floating publish card on tablet and desktop; Publish is the share action; auto-save. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v11: program name and code, Programs search by name or code, filters by origin, New program from a routine or from scratch, builder from a routine, 1 year default expiry. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-852, https://linear.app/didi-build/issue/DIDI-851
- **Oct 25, 2026**: v12: program name required with an inline error; Use for a patient lands on the Publish sheet; Not yet keeps a draft. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-852
- **Oct 25, 2026**: v12 approved by Diadem (7:22 PM ET). Dev: https://linear.app/didi-build/issue/DIDI-810. https://linear.app/didi-build/issue/DIDI-809
