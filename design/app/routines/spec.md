# Routines

Area: app · Feature: routines

## Purpose

Ready-made programs ("cookie cutter programs") for common conditions, in a community library that works like the exercise library, plus each practitioner's own saved copies in My routines. A practitioner can use a routine directly for a patient (a separate program copy with its own name and code), create a program from a routine and tweak it, or still build a program from scratch.

**Matches Product direction: yes.** Checked against the live DIDI-594 description and its locked Product direction comments (read Oct 25, 2026, after the 7:22 PM ET approval).

## Design source (approved Oct 25, 2026, 7:22 PM ET)

| Component | MagicPath link | Component id | Final revision |
| -- | -- | -- | -- |
| Web app, clickable concept | https://designs.magicpath.ai/v1/lucky-river-3731 | 464510460847341568 | 465225161508020224 |
| AI assistant connector, concept | https://designs.magicpath.ai/v1/steadily-brook-7993 | 464510461979815936 | 465211305146613760 |

Diadem approved this revision on Oct 25, 2026, 7:22 PM ET ("v12 is approved"), including the 7 design guesses listed in the routines and programs specs.

## States

| State | What it shows |
| -- | -- |
| All routines | Community routines (published only). Card: 4 exercise thumbnails, name, condition (only when the condition list has values) and body region, "N exercises · Version N", "Used N times", "Added by you", save button (bookmark, or check when saved) |
| My routines | Drafts first under "Drafts, only you can see them", then saved routines. Card shows "Your copy, vN", "Edited", "Used {date}" or "Saved {date}", and an amber "Community updated to vN" flag when the community version is newer. An amber banner counts flagged routines |
| Search | Its own search bar ("Try: knee, low back, bridge"; with conditions: "Try: arthritis, knee, low back"; My routines: "Search my routines"). Searches name, body region, exercise names, and condition when the list has values |
| Filters & sort | Collapsible. Condition (only when the fixed list has values; marked "Sample list" in the concept), Body region, Sort (Most used, Newest, A to Z), Reset, Done |
| Conditions empty | No condition filter, no condition on cards, the routine page or the edit form. Routines list and search normally |
| Routine page | Badges (condition when present, body region, "In My routines", "Community updated"), "Community routine · Version N · Updated {date} by ... · Used N times", who it's for, exercises with type chip and doses, "You sent this routine N times" with codes and "See them in Programs". Actions: Use for a patient (primary), Create program from routine, Save to My routines or Edit my copy, Edit for everyone, Version history, Remove from My routines |
| My copy vs community | When saved: segmented "My copy, vN" / "Community, vN". Your own edits are marked "Your change" against the version you saved. Use for a patient and Create program use the one picked |
| Update flag | Saved copy stays frozen. Banner "Community updated to version N on {date}. Your copy stays on version M until you choose." with "What changed since your version", "Use version N" (primary) and "Keep mine". If you edited your copy: "Updating replaces your own change with version N. You can undo right after." |
| Adopted / kept | Toast "Your copy is now version N" (Undo); or "Kept your copy on version M. You can still update it from this page." (Undo), and "Update my copy to version N" stays in the actions |
| Remove | "Remove from My routines", toast "Removed {name} from My routines" with Undo. No community-wide delete |
| New routine (draft) | "New routine" with a "Draft" badge, saves automatically ("Saving…" then "Draft saved. Only you can see it until you publish."). Fields: Routine name, Condition (only with a list), Body region, "Who it's for (optional)", Exercises (add from the library, type, doses, reorder, remove). Buttons "Done for now" (or "Cancel" while untouched) and "Publish" |
| Publish validation | "Before you publish": "Add a routine name", "Add at least one exercise"; "Your draft is still saved." |
| Draft routine page | "Draft, only you can see it", "Saved automatically today. Not published yet.", Edit draft, Publish, Discard draft (Undo) |
| Publish this routine? | Sheet with the routine card and "What happens": goes live as version 1, anyone can use, improve and restore, no review step. Publish now / Not yet ("Kept as a draft. Only you can see it.") |
| Edit for everyone | Like exercise Edit for everyone: "Edit for everyone" label, "Version N, live", banner "This is the community routine. When you save, it becomes version N+1 for every practitioner...", "Changed" badges, optional "What did you change?", "Save as version N+1" (disabled, "No changes yet", until something changes), "Only want it different for you? Edit my copy instead" |
| Edit my copy | Only the exercises and doses; "Only you see these changes. The community routine stays the same, and programs already sent do not change." Button "Save my copy" |
| Version history | Like exercise version history: Live badge, "Your copy" badge on the version you saved, "Restored from vN" badge, "You sent N programs made from this version", "Restore this version" |
| Restore confirm | "Restore version N?" listing that version's exercises; "Restore as version M"; toast "Version N restored as version M. Programs already sent did not change." |
| Use for a patient | Creates the patient's program copy and lands on "Publish to the live link?" (see programs) |

## Key copy

- Tabs "My routines" / "All routines". My routines description: "Routines you saved or started. A saved routine stays as it was when you saved it. When the community version changes, it is flagged so you can update."
- All routines description: "{N} ready-made programs for common conditions, shared by every practitioner. Anyone can add or improve one, and every change is kept in version history."
- Flag banner: "1 saved routine has a newer community version. Open it to see what changed and update in one tap."
- Sample conditions note: "Sample conditions for this concept. The real fixed list is still to come."
- Routine page note: "Using a routine for a patient makes a separate program with its own name and code. Later edits to this routine never change programs already sent."
- Publish sheet points: "It goes live as version 1 in All routines, for every practitioner." "Anyone can use it, improve it and restore older versions. Every change is kept in version history." "There is no review step. Routines reuse approved exercises, so nothing new needs checking."
- Toasts: "Saved {name} to My routines" (Undo), "Published. Version 1 of {name} is live for every practitioner.", "Saved as version {v} for everyone. Programs already sent did not change.", "Saved to your copy. Only you see it. The community routine did not change.", "Discarded the draft {name}" (Undo).

The full verbatim copy is in the inventory at the end.

## Decisions

1. Routines are in the first version. Nav: Exercises / Routines / Programs / Requests.
2. Community routines follow the exercise-library rules: any practitioner can add or edit, with version history, and each practitioner keeps a personal copy.
3. A saved routine is a frozen copy (rows and version). When the community version is newer it is flagged, with an easy adopt ("Use version N") or "Keep mine". This mirrors My exercises.
4. No review step for routines (they don't generate AI content). Save draft, publish and versions behave like exercises: a new routine is an auto-saved draft only its author sees, published with a confirm as version 1; Edit for everyone saves version N+1; history can restore an older version as a new version.
5. Routine actions mirror exercises: Remove from My routines (Undo) and Restore an older version. No community-wide delete.
6. Using a routine for a patient makes a separate program copy with a practitioner-picked program name and a unique code; later routine edits never change it, and there is no push from a routine to existing copies.
7. "Use for a patient" lands on the existing "Publish to the live link?" sheet with the routine name prefilled; a program name is required to publish; Not yet keeps the program as a draft.
8. Conditions are a fixed list we set up for v1, contents to come from Kojo, possibly empty at launch. Empty list: the condition filter and field are hidden; the five current values are sample data only.
9. The connector searches routines and creates programs from them; it can't create or edit routines.
10. No global search; Routines has its own search bar.

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

Changed in v12 (the approved v12 previews): 02, 04, 04b, 07 to 17, 20 to 22. Unchanged since v11 (rendered from the approved revision): 01, 03, 05, 06, 18, 19. "Use for a patient" and the program-side states are in the programs spec.

| State | Phone (390 px) | Desktop (1280 px) |
| -- | -- | -- |
| 01 all routines | [phone](mockups/01-all-routines-phone.png) | [desktop](mockups/01-all-routines-desktop.png) |
| 02 my routines update flag and draft | [phone](mockups/02-my-routines-update-flag-and-draft-phone.png) | [desktop](mockups/02-my-routines-update-flag-and-draft-desktop.png) |
| 03 search routines | [phone](mockups/03-search-routines-phone.png) | [desktop](mockups/03-search-routines-desktop.png) |
| 04 conditions empty filter hidden | [phone](mockups/04-conditions-empty-filter-hidden-phone.png) | [desktop](mockups/04-conditions-empty-filter-hidden-desktop.png) |
| 04b conditions sample list | [phone](mockups/04b-conditions-sample-list-phone.png) | [desktop](mockups/04b-conditions-sample-list-desktop.png) |
| 05 routine detail community | [phone](mockups/05-routine-detail-community-phone.png) | [desktop](mockups/05-routine-detail-community-desktop.png) |
| 06 routine detail my copy edited | [phone](mockups/06-routine-detail-my-copy-edited-phone.png) | [desktop](mockups/06-routine-detail-my-copy-edited-desktop.png) |
| 07 update flag adopt or keep | [phone](mockups/07-update-flag-adopt-or-keep-phone.png) | [desktop](mockups/07-update-flag-adopt-or-keep-desktop.png) |
| 08 adopted with undo | [phone](mockups/08-adopted-with-undo-phone.png) | [desktop](mockups/08-adopted-with-undo-desktop.png) |
| 09 kept mine | [phone](mockups/09-kept-mine-phone.png) | [desktop](mockups/09-kept-mine-desktop.png) |
| 10 remove from my routines undo | [phone](mockups/10-remove-from-my-routines-undo-phone.png) | [desktop](mockups/10-remove-from-my-routines-undo-desktop.png) |
| 11 new routine draft autosaved | [phone](mockups/11-new-routine-draft-autosaved-phone.png) | [desktop](mockups/11-new-routine-draft-autosaved-desktop.png) |
| 12 edit draft autosaved | [phone](mockups/12-edit-draft-autosaved-phone.png) | [desktop](mockups/12-edit-draft-autosaved-desktop.png) |
| 13 draft publish validation | [phone](mockups/13-draft-publish-validation-phone.png) | [desktop](mockups/13-draft-publish-validation-desktop.png) |
| 14 draft routine detail | [phone](mockups/14-draft-routine-detail-phone.png) | [desktop](mockups/14-draft-routine-detail-desktop.png) |
| 15 publish routine sheet | [phone](mockups/15-publish-routine-sheet-phone.png) | [desktop](mockups/15-publish-routine-sheet-desktop.png) |
| 16 published as version 1 | [phone](mockups/16-published-as-version-1-phone.png) | [desktop](mockups/16-published-as-version-1-desktop.png) |
| 17 edit for everyone | [phone](mockups/17-edit-for-everyone-phone.png) | [desktop](mockups/17-edit-for-everyone-desktop.png) |
| 18 edit my copy | [phone](mockups/18-edit-my-copy-phone.png) | [desktop](mockups/18-edit-my-copy-desktop.png) |
| 19 add exercise sheet | [phone](mockups/19-add-exercise-sheet-phone.png) | [desktop](mockups/19-add-exercise-sheet-desktop.png) |
| 20 version history | [phone](mockups/20-version-history-phone.png) | [desktop](mockups/20-version-history-desktop.png) |
| 21 restore version confirm | [phone](mockups/21-restore-version-confirm-phone.png) | [desktop](mockups/21-restore-version-confirm-desktop.png) |
| 22 version restored | [phone](mockups/22-version-restored-phone.png) | [desktop](mockups/22-version-restored-desktop.png) |

## Locked Product direction (verbatim from DIDI-594)

**DIDI-594 description, section "Routines (new concept"** (https://linear.app/didi-build/issue/DIDI-594):

> ### Routines (new concept, Coach session change #2; LOCKED Oct 25, 2026, 4:35 PM ET, <issue id="b18e358b-bdea-4583-a3a1-dc10329e4241" href="https://linear.app/didi-build/issue/DIDI-852/physio-design-routines-community-and-personal-routine-library-use">DIDI-852</issue>)
>
> **Diadem, Oct 25, 2026, 4:23 PM ET (Designer chat, about** <issue id="0c98d085-6f43-4edd-b5d2-1f19587fd0dc" href="https://linear.app/didi-build/issue/DIDI-809/physio-mvp-concept-design-web-app-and-mcp-connector-flows-to-show-kojo">DIDI-809</issue>, relayed verbatim by Designer under rule 4):
>
> > "Okay, and one more bigger feedback. So everything else was good, but now there should be a new concept. So we have like exercise library for like the global community library and your own personal copy of it. We need the same thing for something called routines, and those are cookie cutter programs. So they would be like, for like common like symptoms or common ailments, like someone goes in with arthritis, so there's like a community library of specific routines, aka cookie cutter programs, that people can just use directly use. Then we have, we still have the concept of the programs, because we need to be able to create a program from scratch for someone who doesn't fit any existing, like, ailments, it's just like, custom to them, and also create a program from a routine, because if they have Like they just need to tweak one small thing in the routine. yeah, so that is, that is the biggest feedback. Like, so basically a new feature."
>
> * **Is:** new concept Routines (cookie-cutter programs for common ailments, e.g. arthritis), with a community library and a personal copy like the exercise library; practitioners can use a routine directly, create a program from a routine and tweak it, or create a program from scratch.
> * **Was:** only exercises (community + personal) and programs; no routines.
>
> **Questions and answers (asked by Designer, Designer chat, Oct 25, 2026, ET; answers are Diadem's words relayed verbatim by Designer under rule 4):**
>
> * **Q1, 4:23 PM:** "Should routines be in the first version Kojo uses, or come right after? My suggestion is the first version, since it was the biggest feedback."
>   Diadem: "First version"
> * **Q2, 4:26 PM:** "When someone uses a routine directly for a patient, should we quietly make a copy of it as that patient's program, so later edits to the community routine don't change what the patient already has? I'd suggest yes; it's still one tap for the practitioner."
>   Diadem: "So yes, that's a great idea. and he wants it to be traceable and trackable, so he knows once we make the copy of it it should be either associated with a code, and even better, associated with maybe a name or some way for him to quickly look up what program he already sent, or what routine he already sent. So maybe he would like to retroactively update it. So, yes."
> * **Q2b, 4:35 PM:** "When he retroactively updates, which does he mean: A) he finds a program he already sent a patient (by its code or name) and edits that one patient's copy, B) he edits a routine and can choose to push the change to every patient copy made from it, or C) both?"
>   Diadem: "A"
> * **Q3, 4:35 PM:** "Should community routines work like the exercise library: any practitioner can add or edit them, with version history, and each practitioner can keep a personal copy? I'd suggest yes, to match."
>   Diadem: "Yes"
> * **Q4, 4:35 PM:** "Should the assistants' connector be able to search routines and create a program from one? I'd suggest yes."
>   Diadem: "Yes"
>
> **Locked:**
>
> | Topic | Locked behaviour |
> | -- | -- |
> | Scope | Routines are in the first version |
> | Using a routine for a patient | Makes a separate patient program copy; later routine edits don't change it |
> | Traceability | Each sent program or copy has a code and a name, and the practitioner can quickly look up what program or routine they already sent (and to whom, and which routine it came from). The hard rule still applies: no patient information is stored, so the name is a non-identifying title and "to whom" is the practitioner's own reference via code or title, not a patient name (CTO reading; see note) |
> | Retroactive update | Practitioner finds an already-sent program by code or name and edits that one patient's copy; no push from a routine to existing copies |
> | Library rules | Community routines work like the exercise library: any practitioner adds or edits, version history, personal copy |
> | Connector | Can search routines and create a program from one |
> | Program paths | Program from scratch and program from routine (then tweak) both remain |
>
> Note: Diadem's Q2 answer says "maybe a name". If he means the patient's name, that conflicts with the hard rule (no patient information stored); CTO to confirm with Diadem before build.
>
> Design: <issue id="b18e358b-bdea-4583-a3a1-dc10329e4241" href="https://linear.app/didi-build/issue/DIDI-852/physio-design-routines-community-and-personal-routine-library-use">DIDI-852</issue>; dev counterpart: <issue id="85b1c650-4cb4-4fab-b29b-798874bb194f" href="https://linear.app/didi-build/issue/DIDI-853/physio-dev-routines-library-and-program-from-routine">DIDI-853</issue>.

**DIDI-594 description, section "Search (global search"** (https://linear.app/didi-build/issue/DIDI-594):

> ### Search (global search proposed 4:36 PM ET, WITHDRAWN 4:37 PM ET; LOCKED: no global search)
>
> **Diadem, Oct 25, 2026, 4:36 PM ET (Designer chat, about** <issue id="0c98d085-6f43-4edd-b5d2-1f19587fd0dc" href="https://linear.app/didi-build/issue/DIDI-809/physio-mvp-concept-design-web-app-and-mcp-connector-flows-to-show-kojo">DIDI-809</issue>, relayed verbatim by Designer under rule 4):
>
> > "One more thing, when you redesign, when you do the redesign so each, like the exercise library and the programs will have a, like, search bar on each page. There should also be a search bar, like, a consolidated one, so that when they open the app, they can just search anything and it will show up. It will bring up exercises, routines, and programs, so they can just, like, very quickly search anything."
>
> **Diadem, Oct 25, 2026, 4:37 PM ET (Designer chat, relayed verbatim by Designer under rule 4):**
>
> > "wait nevermind"
>
> **Designer, 4:37 PM ET:** "Never mind which part?"
>
> **Diadem, 4:37 PM ET:**
>
> > "Drop the global search"
>
> * **Is:** no global search; each page keeps its own search bar, as already designed.
> * **Was:** same (4:36 PM proposal withdrawn at 4:37 PM).

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

**DIDI-594 comment, 2026-10-25 21:36 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> **Product direction lock: condition list for routines (Diadem, Oct 25, 2026, 5:35 PM ET, via Designer, v11 Q5 for DIDI-852):**
>
> Asked: "Routines are filtered by condition (right now that's placeholder data: Arthritis, After surgery, Back pain, Neck and shoulder, Sprain). Who should manage that list?"
>
> > "fixed list we set up for v1"
>
> | Case | Behaviour |
> | -- | -- |
> | Condition list in v1 | A fixed list that we set up; practitioners can't add to or edit it |
> | List contents | Still open: the five shown are placeholder data, and Diadem hasn't given the real list yet |
>
> **Is/was:** was: open, with placeholder data. Is: a fixed list we set up for v1. No conflict with earlier direction. The real list contents are an open question for Diadem.

**DIDI-594 comment, 2026-10-25 21:39 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> **Product direction lock: what the connector can do with routines (Diadem, Oct 25, 2026, 5:39 PM ET, via Designer, v11 Q6 for DIDI-852):**
>
> Asked: "In v11, Claude (the connector) can search routines and create a patient program from one, but it can't create or edit routines themselves. Is that right for v1?"
>
> > "Yes, the connector only searches routines and creates programs from them"
>
> | Connector action | v1 |
> | -- | -- |
> | Search routines | Yes |
> | Create a patient program from a routine | Yes |
> | Create or edit routines | No |
>
> **Is/was:** This confirms the Q4 lock from 4:23-4:35 PM (the connector can search routines and create a program from one) and adds that it can't create or edit routines. No conflict with earlier direction.

**DIDI-594 comment, 2026-10-25 21:44 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> **Product direction lock: routine actions in v1 (Diadem, Oct 25, 2026, 5:44 PM ET, via Designer, v11 Q7 for DIDI-852):**
>
> Asked: "Which of these routine actions should v1 have? Delete a routine / Restore an older version / Remove from My routines / None of these for v1"
>
> > "everything I said earlier should be in v1. essentially mirroring exercises"
>
> | Routine action | v1 |
> | -- | -- |
> | Delete, restore an older version, remove from My routines | Same as the exercise library: each one is in v1 exactly when exercises have it |
> | Everything locked earlier today for routines | In v1 |
>
> **Is/was:** was: open in the v11 draft. Is: routines mirror the exercise library's actions in v1. No conflict with earlier direction (Q3 already said library rules like the exercise library). Designer is filling in the exact action list from the approved exercise spec, by reference rather than as a new product call.

**DIDI-594 comment, 2026-10-25 21:45 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> **Product direction lock: v1 condition list contents (Diadem, Oct 25, 2026, 5:45 PM ET, via Designer):**
>
> Asked: "Which conditions should the v1 list have? The placeholder ones are Arthritis, After surgery, Back pain, Neck and shoulder, Sprain." The options were "Keep those five" and "I'll ask Kojo" (B).
>
> > "B, but maybe even start with 0"
>
> | Case | Behaviour |
> | -- | -- |
> | Source of the list | Diadem gets it from Kojo (tracked in a Low Ready for maintainer ticket) |
> | v1 may launch with 0 conditions | Supported: when the list is empty, the condition filter is hidden and routines still list and search normally |
> | The five placeholders | Not shipped as real data |
> | Storage | Fixed list seeded by us (5:35 PM lock), so adding Kojo's list later is a data change, not a redesign |
>
> CTO decision (technical, not product): "maybe" doesn't need a firm call before DIDI-853, because the build supports both an empty list and a filled one.
>
> **Concrete routine actions for the 5:44 PM "mirroring exercises" lock**, by reference to the approved DIDI-809 v10/v11 MagicPath design (web component 464510460847341568, approval-diff.md item 8):
>
> | Action | Exercises | Routines v1 |
> | -- | -- | -- |
> | Remove from My library (with Undo) | Yes | Yes, remove from My routines |
> | Restore an older version (version history) | Yes | Yes |
> | Community-wide delete | No | No |

## Copy inventory (verbatim from the approved source)

Every user-facing string in the parts of the approved source that render this feature, in source order. `{...}` marks a value filled in at runtime (a name, a count, a version, a date). Sample data (exercise names, program names, dates) is example content, not copy.

### Screens and sheets

- All conditions
- All regions
- Routines
- New routine
- My routines
- All routines
- Routines you saved or started. A saved routine stays as it was when you saved it. When the community version changes, it is flagged so you can update.
- Open it to see what changed and update in one tap.
- Search routines
- Search my routines
- Try: arthritis, knee, low back
- Try: knee, low back, bridge
- Clear
- Condition
- Sample list
- Sample conditions for this concept. The real fixed list is still to come.
- Body region
- Sort
- Reset
- Done
- No routines saved yet
- No routine matches
- Save one from All routines, or make your own.
- Try a body region or an exercise name. Or add the routine yourself.
- Browse all routines
- Drafts, only you can see them
- Saved
- Draft, only you can see it
- Untitled routine
- Oct 25, 2026
- Exercises
- No exercises yet.
- Publish it to use it for patients and share it with every practitioner. There is no review step for routines.
- Edit draft
- Publish
- Discard draft
- Save to My routines
- Edit my copy
- Make my own copy
- Edit for everyone
- Version history
- Remove from My routines
- In My routines
- Community updated
- What changed since your version
- Keep mine
- My copy, v{m.v}{myChanges ? ', edited' : ''}
- Community, v{r.version}
- Version to use
- Your saved copy, frozen at version {m.v}{myChanges ?
- The live community version.
- Your change
- Using a routine for a patient makes a separate program with its own name and code. Later edits to this routine never change programs already sent.
- See them in Programs
- Use this routine
- Use for a patient
- Makes a separate copy and opens Publish, with the link to send.
- Create program from routine
- Opens the builder so you can tweak it first.
- Create program
- Every change to the community routine is kept. Restoring an older version saves it as a new version, so nothing is lost.
- Live
- Your copy
- A practitioner
- Restore this version
- Programs already sent never change. Saved copies in My routines get a flag to update.
- Restore version {rRestore.v}?
- Cancel
- Programs already sent keep their version. Practitioners who saved this routine get a flag to update.
- Add a routine name
- Add at least one exercise
- Changed
- No changes yet
- Save my copy
- Draft
- Saving…
- Draft saved. Only you can see it until you publish.
- This is the community routine. When you save, it becomes
- history
- and anyone can restore it.
- Programs already sent don't change. Saved copies in My routines get a flag to update.
- Only you see these changes. The community routine stays the same, and programs already sent do not change.
- Your draft is still saved.
- Before you publish
- Before you save
- Routine name
- Knee osteoarthritis, starter
- Add a name to publish.
- Who it's for
- (optional)
- Gentle strength for knee osteoarthritis, three days a week
- Describe the condition, not a patient. No names or patient details.
- Add at least one exercise to publish.
- No exercises yet. Add them from the exercise library.
- Move {ex.name} up
- Move {ex.name} down
- Remove {ex.name}
- Type for {ex.name}
- Add exercise
- What did you change?
- For example: added calf stretch
- Shown in version history so others know why it changed.
- Only want it different for you? Edit my copy instead
- Done for now
- Publish this routine?
- Not yet
- Publish now
- Kept as a draft. Only you can see it.
- What happens
- It goes live as version 1 in All routines, for every practitioner.
- Anyone can use it, improve it and restore older versions. Every change is kept in version history.
- There is no review step. Routines reuse approved exercises, so nothing new needs checking.
- Not yet keeps it as a draft that only you can see.
- Add exercise to routine
- From the exercise library
- Added {ex.name}
- Saved automatically. Not published.
- Edited
- Used {m.usedAt}
- Saved {m.savedAt}
- Added by you
- Save {r.name} to My routines

### Toasts and messages from app logic

- Saved {r.name} to My routines
- Untitled routine
- Discarded the draft {r.name \|\| 'Untitled routine'}
- Removed {r.name} from My routines
- Your copy is now version {r.version}
- Kept your copy on version {prev.v}. You can still update it from this page.
- Restored version {old.v}
- Exercises and doses from version {old.v}
- First version
- Published with {nr.rows.length} exercises
- Published. Version 1 of {nr.name} is live for every practitioner.
- Edited the exercises
- Saved as version {v} for everyone. Programs already sent did not change.
- Saved to your copy. Only you see it. The community routine did not change.


## Changes

- **Oct 25, 2026**: v11: Routines added (community and My routines, search, filters, routine page, use for a patient, create program from routine, edit for everyone, my copy, version history). https://linear.app/didi-build/issue/DIDI-852, https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v12: saved copies frozen with update flag and adopt; drafts with auto-save and publish confirm, no review; restore an older version; remove from My routines with Undo; Use for a patient lands on the Publish sheet; condition list empty or sample. https://linear.app/didi-build/issue/DIDI-852, https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v12 approved by Diadem (7:22 PM ET), including the 7 design details above. Dev: https://linear.app/didi-build/issue/DIDI-853. https://linear.app/didi-build/issue/DIDI-852
