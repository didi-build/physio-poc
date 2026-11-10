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
| Programs list | Heading "Programs", "New program", its own search ("Search by name or code"), filter pills All / From a routine / From scratch, count when the list is not empty (see list count copy below; no count when empty). Empty list: heading "No programs yet", helper "Start one from a routine or from scratch. You can find it here later by name or code.", the same "New program" button (opens the start sheet). Card: name, code chip, exercise count ("1 exercise · Sent {date}" or "{n} exercises · Sent {date}"; zero-exercise draft card "No exercises yet"), origin ("From routine {name}, v{N}, used as is" or ", then tweaked", or "Built from scratch"), link status, flags ("Not published yet", "Draft changes not published", "1 library update to review" for one or "{n} library updates to review" for more, as in mockups 01, 29 and 05). Recently deleted: "Restore a deleted program for 30 days. After that it's gone for good. Its old share link stays closed." When empty: "No deleted programs." |
| Persistent controls | Programs list: search ("Search by name or code") and origin filter pills (All / From a routine / From scratch) stay rendered in the same place during initial loading, with zero programs, with zero matches, and when populated. Empty-state content renders below those controls, never in their place, matching the Exercises page. Zero programs: heading "No programs yet", helper "Start one from a routine or from scratch. You can find it here later by name or code.", the same "New program" button (opens the start sheet). Zero matches: "No program matches ..." with "Clear search". The current query and filter selection is kept. No count when the list is empty (unchanged). |
| Search | By name, code (with or without "PRG-") or routine name; the matching code is highlighted. No match: "No program matches ..." with "Clear search" |
| New program | Sheet "New program": "From a routine" (pick a routine, then Create program from routine) or "From scratch" |
| Builder | Code chip, required "Program name", origin banner when made from a routine ("From routine: {name}, version {N}" with "View routine"), status card, exercise rows (type, doses, notes, reorder by dragging the dots grip or Shift with the up and down arrow keys, duplicate, remove, version; see Builder reorder), Add exercise sheet (My exercises first, then the full library), Delete program |
| Auto-save | No Save button. "Saving..." then "Saved". Save failure (same spot as saving status on phone status card and desktop publish card): status "Not saved", helper "Your latest changes aren't saved yet.", one alert "Not saved. Your latest changes aren't saved yet.", button "Try again" (accessible name "Try saving again"). A failed save retries automatically; "Try again" stays available. While retrying, "Saving..."; on success, "Saved". Publish stays disabled until the latest changes are saved. Unsaved edits when leaving the builder show a warning first (see leave warning). Status: "Not published yet" / "Unpublished changes" / "Published {time}" |
| Sticky publish card | On tablet landscape and desktop (1024 px and up) the publish card floats in the right column; on phones actions sit in the bottom bar |
| Library update prompt | "Library update for {exercise}": "Programs aren't updated on their own. Update it, or keep your original." with "Update to vN" / "Keep my original" |
| Publish to the live link? | Program card (name, code, exercise count); "Program name (required)" field on a first publish or when the program has no name; "First publish" or "Changes since {time}"; Share link with Copy (or "No link yet..." on a first publish or closed link); Link expires (1 week, 30 days, 90 days, 1 year default, Never, Pick a date); "Publish now" / "Not yet" |
| Name required | Empty name: red field, "Add a program name to publish. Use something you will recognise, not the patient's name.", Publish now disabled |
| Placeholders block publish (DIDI-1186) | Any exercise row still a placeholder ("Pending review"): the Publish sheet shows an amber notice listing each placeholder with "Review draft" and Remove, and Publish now is disabled. Same treatment on first publish, republish and Use for a patient. See "Publish blocked by placeholders (DIDI-1186)" below |
| Use for a patient | From a routine: the copy is created (code, routine name prefilled) and the practitioner lands on the Publish sheet. Publish now creates the link; Not yet keeps it as a draft ("Kept as a draft. Find it in Programs by name or code {code}.") and it shows in Programs as "Not published yet" |
| Sent copy | Opening a sent program from Programs edits only that patient's copy |
| Delete | Sheet "Delete this program?": moves to Recently deleted, restorable for 30 days, closes its share link |
| Share screen | PDF preview made from the link page, Share link, Link page, Download PDF, close link |
| Close link | "Close this share link?": the program stays in Programs; anyone who opens the old link sees "This link was closed"; "Create a new link" later |
| Link page | What anyone with the link sees, no sign-in: latest published version, Save as PDF, Print, each exercise's media carousel, and the expiry line (on screen only; it is not printed, DIDI-1192) |
| Link page exercise media | Each exercise shows one carousel: slide 1 the start to end transition (6s loop), slide 2 Start, slide 3 End. Phone: title, carousel, dose, notes. 1024 px and up: text left, carousel right. Print and PDF: text, Start, End in three columns, no video and no controls. Load failed: "Images didn't load." with "Try again". No tag, no identifiers. See "Link page exercise media (DIDI-1192)" |
| Missing images block publish | Any exercise without its start or end image blocks Publish now on "Publish to the live link?" (including Use for a patient) and on "Publish this routine?". Remove is the only action. See "Publish blocked by missing images (DIDI-1192)" |
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
- Link page media (DIDI-1192): captions "Start" / "End"; carousel indicators named "Video", "Start", "End"; desktop chevrons "Previous" / "Next" (approved Nov 10, 2026, 12:09 AM ET); loop button "Pause video" / "Play video"; alt "{title}, start position" / "{title}, end position"; load failed "Images didn't load." with "Try again" (accessible name "Try loading images for {title} again", approved Nov 9, 2026, 11:31 AM ET). Dose in three lines from the existing readout phrases. The expiry line is not printed.
- Missing images block (approved Nov 9, 2026, 11:31 AM ET, DIDI-1192): "Remove exercises without images to publish"; "{n} exercises are missing their start or end image. Remove them from this program, then publish." / "One exercise is missing its start or end image. Remove it from this program, then publish."; "No exercises without images left. You can publish."
- Programs list empty: "No programs yet"; "Start one from a routine or from scratch. You can find it here later by name or code." No count when the list is empty.
- Recently deleted empty (after the section intro): "No deleted programs."
- List count: the noun follows the total ("1 program", "5 programs", "1 of 1 program", "0 of 1 program", "1 of 5 programs", "0 of 5 programs"). Announce count changes politely.
- Program card exercise count: "1 exercise · Sent {date}" / "{n} exercises · Sent {date}". Accessible: "1 exercise, sent {date}" for one exercise; "{n} exercises, sent {date}" otherwise (the middle dot is hidden from screen readers). Zero-exercise draft card: "No exercises yet".
- Auto-save failure: status "Not saved"; helper "Your latest changes aren't saved yet."; alert once "Not saved. Your latest changes aren't saved yet."; "Try again" (accessible name "Try saving again"). Failed saves retry automatically; publish stays disabled until saved.
- Leave with unsaved edits: "Leave without saving?"; "Your latest changes aren't saved yet. If you leave now, you'll lose them."; "Keep editing" / "Leave".
- Builder reorder: hint "Press and hold the dots to reorder. Use copy to add the same exercise again, for example in a second version." (approved, unchanged); while dragging "Moving {name}. Release to drop it in place {n}." (approved v12 source). Approved by Diadem (Oct 31, 2026, 1:28 PM ET, DIDI-1152): grip "Reorder {name}, position {n}. Press and hold, then drag. Or hold Shift and use the arrow keys."; after any move, read out politely: "{name} moved to position {n} of {total}". Screen reader only actions "Move {name} up" / "Move {name} down" (approved 1:30 PM ET); no visible up and down buttons. See Builder reorder.

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

## Builder reorder (DIDI-1152)

**Ruling (Diadem, Oct 31, 2026, 1:19 PM ET, DIDI-1152):** "keep drag and drop and add a keyboard only way to drag and drop (hold shift while using the up/down arrow keys)"

This is locked in DIDI-594's Product direction block (is/was in DIDI-1152 comment f3140a23, https://linear.app/didi-build/issue/DIDI-1152). **Is:** drag and drop stays, with the dots grip as the drag handle, and Shift plus Up or Down moves the focused row. **Was:** no locked direction; Designer's earlier no-drag proposal is dropped.

**Approval (Diadem, Oct 31, 2026, 1:28 PM ET, DIDI-1152):** "yes it is only for screen reader. I approve for drag and drop but let's remove the up/down buttons (visual clutter)." This approves the grip name and the move read-out below, and removes the up and down buttons from the builder row. The hint stays as approved.

**Matches Product direction: yes.** It follows the DIDI-1152 lock above. The locked scope also asks for "Create an exercise program from selected approved exercises (sets, reps, notes)." (DIDI-594 description, section "MVP scope (Diadem, Oct 23, 2026", quoted under Locked Product direction below) and doesn't say how rows are reordered. Drag with the dots grip is in the approved v12 source, and this ruling keeps it. Reorder in the connector (DIDI-594 comment, 2026-10-24 22:58 UTC, Q6) is not affected.

Rows move three ways: drag the dots grip (touch or mouse), hold Shift and press Up or Down while the grip has focus, or, for screen reader users only, the hidden "Move {name} up" and "Move {name} down" actions (Diadem, 1:30 PM ET). There are no visible up and down buttons on the row (removed, Diadem, 1:28 PM ET: "visual clutter").

### Renders (390 px phone)

| State | Phone |
| -- | -- |
| Builder reorder rest | [phone](mockups/didi-1152-01-reorder-rest-phone.png) |
| Builder reorder rest annotated | [phone](mockups/didi-1152-02-reorder-rest-annotated-phone.png) |
| Builder reorder dragging | [phone](mockups/didi-1152-03-reorder-dragging-phone.png) |

### Grip

- The six-dot grip at the left of the row header is a real control: a native button, focusable, 44 by 44 px, not hidden from screen readers. Its accessible name is the approved grip name below.
- Pressing or clicking it without dragging does nothing. Enter and Space do nothing.
- Look: slate dots as in v12; on hover and while lifted, teal dots on a light teal tile; a visible teal focus ring. Mouse cursor "grab", and "grabbing" while lifted.

### Touch (390 px phone first)

- Only the grip starts a drag. The rest of the row scrolls the page as usual.
- The grip never scrolls the page (`touch-action: none` on the grip only), so a swipe that starts on the grip can't be read as both a scroll and a drag.
- Hold delay: the row lifts after 280 ms of pressing the grip (the v12 timing). If the finger moves more than 8 px before then, nothing lifts. A short buzz when it lifts, where the phone supports it.
- While lifted, the row follows the finger. Lifting the finger drops it where the drop line is. If the touch is cancelled (a call, the browser takes the gesture), the row goes back where it was and nothing saves.
- Auto-scroll: when the finger is within 48 px of the top of the screen, or of the top of the phone's bottom action bar, the list scrolls that way, faster the closer it gets.

### Mouse

- Press on the grip and move 4 px to lift (no hold delay). Release to drop. Escape while dragging puts the row back and nothing saves.

### While dragging

- **Lifted row:** raised with a strong shadow and a 2 px teal ring, slightly larger (102%) and tilted 1 degree, as in v12.
- **Other rows:** compact, as in v12: only the grip, name and type line show, at 80% opacity, so the whole list fits on a phone screen while dragging. Duplicate and Remove hide until the drop.
- **Drop line:** a 2 px teal line, full row width, with a small dot at each end, in the gap where the row will land. Only one drop line shows at a time.
- **Status line:** the hint is replaced by the v12 status "Moving {name}. Release to drop it in place {n}." (approved source), read politely.
- **Reduced motion:** when the device asks for reduced motion, no tilt, no scaling and no animated movement of the other rows. The lifted row keeps its shadow and ring, and the drop line still shows. Auto-scroll still works.

### Keyboard

- Rule (CTO, Oct 31, 2026, 1:21 PM ET): Shift+Up and Shift+Down apply only when the row card or its drag handle has focus, never inside a text field or select, so they never take over text selection (Shift+arrow selects text in the notes field).
- Designer's choice within that rule: keys work on the **grip**, not the row card. Why: the grip is the control that moves the row, its accessible name explains the keys, and it is the v12 pattern. Today the row card (`article`, focusable) listens for the arrow keys, and because the key events bubble up from the notes field and the type control, pressing Up or Down while typing a note or choosing a type also moves the row. The row card stops being focusable and stops listening for keys, which fixes that bug.
- With the grip focused, Shift+Up moves the row up one place and Shift+Down moves it down one place. Plain Up and Down do nothing. Keys only count when the grip itself has focus.
- On the first row Shift+Up does nothing, and on the last row Shift+Down does nothing. No sound, no message.
- After a move, focus stays on the moved row's grip.
- While a move is saving, Shift+arrow is ignored and the grip stays focusable (it is not disabled), so focus never drops.

### After any move

- After a drag, Shift+arrow or screen reader action move is saved, a polite, visually hidden message says where the row is now (approved read-out below). Today only "Saving..." then "Saved" is heard.
- If the save fails, the existing auto-save failure state applies; the row stays where it was dropped.

### Screen reader actions: Move up and Move down (Diadem, Oct 31, 2026, 1:30 PM ET)

Designer asked: "Without the buttons, someone using a phone screen reader can only reorder by dragging. Add hidden "Move up" and "Move down" actions that only screen readers see, with nothing on screen?" Diadem's answer, verbatim: "Yes, add screen reader only Move up and Move down actions".

- Each grip has two screen-reader-only actions, "Move {name} up" and "Move {name} down". Nothing shows on screen and nothing changes in the layout.
- How they are exposed is Developer's choice: accessibility custom actions on the grip, or visually hidden buttons next to the grip that only screen readers reach. Requirement: VoiceOver (iOS and macOS) and TalkBack (Android) can find and trigger them. Note: web pages have no shipped ARIA custom-actions attribute today, so visually hidden buttons are the likely route. If they are buttons, take them out of the Tab order (`tabindex="-1"`) so sighted keyboard users never land on something invisible; screen reader swipe navigation still reaches them, and keyboard users have Shift+Up and Shift+Down.
- Not offered at the ends: no "Move {name} up" on the first row and no "Move {name} down" on the last row (left out, not just disabled).
- They call the same shared reorder action as drag and Shift+arrow, and end with the same read-out.
- After one, screen reader focus stays on the moved row (its grip, or the same action if it is still offered).
- Dragging the grip with the platform's double-tap-and-hold gesture still works too; the grip must receive pointer events during that gesture.

### Approved strings (Diadem, Oct 31, 2026, 1:28 PM ET)

| Where | Was (approved v12) | Now (approved) |
| -- | -- | -- |
| Grip, accessible name | Reorder {r.name}, position {i + 1}. Press and hold, then drag. Or use the arrow keys. | Reorder {name}, position {n}. Press and hold, then drag. Or hold Shift and use the arrow keys. |
| Read-out after any move (not visible) | none | {name} moved to position {n} of {total} |
| Screen reader only action, up (approved Oct 31, 2026, 1:30 PM ET) | none | Move {name} up |
| Screen reader only action, down (approved Oct 31, 2026, 1:30 PM ET) | none | Move {name} down |

`{name}` is the row's exercise title. In the grip name `{n}` is the row's current position. In the read-out `{n}` is its new position and `{total}` the number of rows, counting from 1.

Unchanged approved copy: the hint "Press and hold the dots to reorder. Use copy to add the same exercise again, for example in a second version." It doesn't mention the keys (Designer's recommendation, accepted by Diadem at 1:28 PM ET): Kojo is mostly on a phone, and screen reader users hear the keys in the grip's name.

Removed: the visible up and down buttons. Their names live on only as the screen reader only actions above. `reorderRowAriaLabel` ("Reorder {name}, position {n}. Press and hold, then drag. Or use the arrow keys.") is replaced by the approved grip name and is no longer on any button.

### Notes for Developer

- **One reorder action (CTO, Oct 31, 2026, 1:21 PM ET):** drag, Shift+Up or Down and the screen reader only Move up and Move down actions all call the same reorder action, so they share one save path and one auto-save key, and all end with the same read-out.
- **Remove:** the visible up and down buttons in `src/ui/programs/ProgramBuilderRowCard.tsx` (lines 187 to 204 on main f4c0ab1), their icons (lines 41 to 71), the row card's `tabIndex` and arrow-key handler (lines 126 to 139). Change `reorderRowAriaLabel` in `src/ui/copy/programs.ts` (lines 236 to 237) to the approved grip name, with `{n}` as the current position.
- **Tests that reference the up and down buttons or the old label** (on main f4c0ab1): `test/ui/programs-builder-dev-verify.test.tsx` lines 183, 536, 539 and 770 (name `/Reorder Alpha move, position .../`) and line 534 (checks the decorative grip `.pg-row-grip svg`); `test/ui/programs-qa-round1.test.tsx` line 502; `test/ui/programs-builder-actions.test.tsx` lines 178 and 212. They find the buttons by the old label and click them, so they need to move to the screen reader only actions ("Move {name} up" / "Move {name} down"), Shift+arrow on the grip, or the shared reorder action.
- **Drag library (a note, not a decision):** package.json has no drag library (dependencies are react, react-dom, react-router-dom and the Better Auth and MCP packages). The v12 source does drag with native pointer events, a 280 ms timer and pointer capture, in about 30 lines, and Shift+arrow is a few lines on the grip's key handler. Native pointer events look like the smaller path. dnd-kit (@dnd-kit/core plus @dnd-kit/sortable) would add packages and its keyboard sensor uses Space to pick up and plain arrows to move, which would need changing to match Shift+arrow. Developer's call.

## Publish blocked by placeholders (DIDI-1186)

Locked Product direction (DIDI-594, decision DIDI-1088). Diadem, Nov 8, 2026, 1:45 PM ET, verbatim:

> Block publish until every placeholder is approved or removed.

Variant D. Diadem, Nov 8, 2026, 1:55 PM ET, verbatim: "Go with D". Copy, 1:56 PM ET, verbatim: "Yes, approve all of D's wording". Locked by CTO on DIDI-594, confirmation comment b196ba23 on DIDI-1186. Design: https://designs.magicpath.ai/v1/wisely-road-5070 (MagicPath project 470251620010196992).

### Rule

| Case | Behaviour |
| -- | -- |
| Any placeholder remains | Publish is blocked. Placeholders are never published and never silently left out |
| Every placeholder approved or removed | The placeholder block clears. Publish now stays subject to every other publish requirement, for example the required program name ("Name required" above). An empty placeholder list alone does not enable Publish now |
| Blocked publish | The live snapshot and the live link stay unchanged. No link is created or updated, and expiry is not applied, as a side effect |
| Review draft | Only opens that exercise's draft for review. It never approves anything and never implies automatic approval |
| Remove | Removes only that row from this program (same action as the row's existing Remove {name}). Nothing else changes |

### Where it shows

The existing "Publish to the live link?" sheet (WebAppClickableConcept.tsx :1381-1420) gains a placeholder notice directly under the program card (:1385). Everything else in the sheet is unchanged.

| Scenario | Behaviour |
| -- | -- |
| First publish | Notice under the program card, then "Program name (required)", "First publish", the "No link yet. Publishing creates it, ready to copy and send." share link box and Link expires, as today. Publish now disabled while any placeholder remains. Not yet keeps the draft ("Kept as a draft. Find it in Programs by name or code {code}.") |
| Republish | Notice under the program card, ending with the existing line "Not live yet. Your patient still sees the version published {pub.at}." (spec.md:511). "Changes since {time}", the current share link with Copy and Link expires render as today. The patient keeps seeing the last published version on the same link |
| Use for a patient | Unchanged landing (Oct 25 lock): the copy is created and the practitioner lands on the Publish sheet. If the routine's exercises include placeholders, the sheet shows the same notice as First publish. Not yet keeps the draft as today |

Notice contents, in order:
1. Heading with the alert icon (I.alert): "Approve or remove placeholders to publish".
2. Body: "{n} exercises are placeholders. Approve each draft or remove it from this program, then publish." For one: "One exercise is a placeholder. Approve each draft or remove it from this program, then publish."
3. One list item per placeholder: exercise name, the existing "Pending review" badge, "Review draft" link button, Remove icon button.
4. Republish only: "Not live yet. Your patient still sees the version published {pub.at}."

When the last placeholder is removed or approved, the heading switches to the check icon (I.check, text-teal-700) and "No placeholders left. You can publish.", the body and list go away, and Publish now follows the other publish requirements.

### 390 px and 1280 px

Tokens are existing ones from design/reference/web-app/generated/WebAppClickableConcept.tsx. No new values.

| Element | 390 px (phone, mobile first) | 1280 px (desktop) | Source |
| -- | -- | -- | -- |
| Sheet | Bottom sheet, `rounded-t-3xl`, grabber, `max-h-[88vh]` | Centered dialog, `lg:max-w-lg lg:rounded-3xl` | Sheet :148-160 |
| Notice container | `mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900` (layout of the "Before you publish" box :1765, amber tones of Badge amber :133) | same | :1765, :133 |
| Heading | `flex items-start gap-1.5 font-semibold`, icon `mt-0.5 h-4 w-4 shrink-0` | same | :1389 |
| List | `mt-2 divide-y divide-amber-200`, rows `flex flex-wrap items-center gap-2 py-2`; on 390 the name wraps above the actions | single line per row | :133 tones |
| Review draft | `linkBtn` (:65), min-h-11 touch target | same | :65 |
| Remove | `iconBtn` (:64), 44 px target | same | :64, :1330 |
| Pending review badge | `Badge tone="amber"` | same | :132-134, :1326 |
| Republish line | `mt-2 text-xs text-amber-800` | same | :1334 |
| Footer buttons | `flex-col-reverse`, `min-h-12` | `lg:flex-row lg:justify-end`, `lg:min-h-11` | :1382 |
| Disabled Publish now | `primary` with `disabled:cursor-not-allowed disabled:opacity-50` | same | :59-60 |

### Accessibility

- **Notice role: `role="status"` on the notice section, labelled by its heading (`aria-labelledby`).** Why: in this spec `role="alert"` is used for errors caused by the practitioner's own input or a failure (name required at :1389, save failure "alert once", spec.md:55). The placeholder block is a known condition present when the sheet opens, not an error from an action, so it is announced politely after the dialog title instead of interrupting it.
- **Publish now:** `disabled` while any placeholder remains (same as the name rule), plus `aria-describedby` pointing at the notice id, so the reason is read with the button. Once the list is empty, `aria-describedby` is removed and the button follows the other publish requirements (for example it stays disabled with the name help if the name is empty).
- **Removal announcement:** a polite live region (`aria-live="polite"`, sr-only) inside the notice says "Removed {name} from this program." and, when the list becomes empty, also "No placeholders left. You can publish."
- **Focus on open:** unchanged (sheet heading, existing Sheet behaviour).
- **Focus after Remove:** moves to the next placeholder's "Review draft" (or the previous one if it was the last row). When the list empties, focus moves to the notice heading ("No placeholders left. You can publish.", `tabIndex={-1}`) so the practitioner hears the state, then continues to Publish now.
- **Focus after Review draft:** the draft opens for review. On return to the sheet, focus goes back to that row's "Review draft" if it is still a placeholder; if it was approved, focus follows the Remove rule above.
- **Accessible names:** "Review draft for {name}"; Remove uses the existing "Remove {name}"; the notice is named by its heading "Approve or remove placeholders to publish" (or "No placeholders left. You can publish.").
- No automatic approval, omission or publication anywhere in this flow.

### Approved copy (Diadem, Nov 8, 2026, 1:56 PM ET)

| Element | String |
| -- | -- |
| Notice heading | Approve or remove placeholders to publish |
| Notice body, {n} | {n} exercises are placeholders. Approve each draft or remove it from this program, then publish. |
| Notice body, one | One exercise is a placeholder. Approve each draft or remove it from this program, then publish. |
| Row action | Review draft |
| Row action, accessible name | Review draft for {name} |
| After a removal (live region) | Removed {name} from this program. |
| List empty | No placeholders left. You can publish. |

Reused verbatim, unchanged: "Publish to the live link?", "Publish now", "Not yet", "Pending review", "Remove {name}", "Placeholder. It links to the real exercise once you approve the draft.", "Not live yet. Your patient still sees the version published {pub.at}.", "Kept as a draft. Find it in Programs by name or code {code}.".

DIDI-1105 (type-mismatch messaging after approval) is separate and unchanged.

## Link page exercise media (DIDI-1192)

Diadem, verbatim:
- Nov 9, 2026, 11:12 AM ET (CTO chat): "let's start this"
- Nov 9, 2026, 11:25 AM ET: "Video means the start and end image transition, nothing new"
- Nov 9, 2026, 11:26 AM ET: "all exercises require the media"
- Nov 9, 2026, 12:42 PM ET: "let's rework the design. I think in the link we just have 1 carousel. the video is first, they can scroll to the individual images. when it is printed out,pdf, the video is no longer needed so we see both images inline"
- Nov 10, 2026, 12:05 AM ET: "E6c sentences, but put "3x a week"/"everyday" on its own new line"
- Nov 10, 2026, 12:08 AM ET: "Yes, approve E7"
- Nov 10, 2026, 12:09 AM ET: "yes I approve. and one more minor detail. on the print version, "images didn't load" should go on the images column (a merged column 2 and 3)"

The full set of locked quotes (DIDI-594 entries C to G update 4) is under "Locked Product direction" below.

Design: E7, https://designs.magicpath.ai/v1/keen-current-4842 (MagicPath project 470575340046131200, component 470769311091429376, revision 470770451010957312).

**Matches Product direction: yes.** The design follows DIDI-594 G (one carousel, video first, both images inline in print), G update (E1 dots with a play symbol for the video dot), G update 3 (media right after the title, 2 columns on desktop, 3 print columns, no expiry line in print) and G update 4 (E6c sentences, frequency on its own line). "Video" is the existing browser transition between the Start and End images (ExerciseMotion.tsx). Nothing new is generated or stored, in line with the Oct 29, 2026 media direction on DIDI-594 (start and end images with a browser transition, no AI video in V0 and V1).

| Topic | Was (variant D, approved Nov 9, 2026, 11:31 AM ET, superseded 12:42 PM ET) | Is (E7, approved Nov 10, 2026, 12:08 and 12:09 AM ET) |
| -- | -- | -- |
| Media on screen | Start and End stills with a "Play video" / "Show images" toggle that swapped in the loop in the same frame | One carousel per exercise: slide 1 the loop, slide 2 Start, slide 3 End. No toggle; "Show images" is not used on this page |
| Order on phone | Title, dose, note, media, toggle | Title, carousel, dose, notes |
| 1024 px and up | Two equal columns, text left and media right, in the 42rem page | Two columns, text left and carousel right, in a 64rem page |
| Dose | One line from `formatExerciseParams` | Three lines with the numbers in bold: reps and hold, then sets and rest, then the frequency |
| Print and PDF | Text left, Start and End stills right; a failed row printed text only; the expiry line printed | Three columns: text, Start, End. A failed row prints "Images didn't load." across columns 2 and 3. The expiry line is not printed |
| Load failed on screen | Message and "Try again" under the note | Message and "Try again" in place of the carousel |

### Rule

| Case | Behaviour |
| -- | -- |
| Media source | Only the published exercise version's own Start and End images (DIDI-1191). Never stock or default images. `exerciseVisualPlaceholders` is never used on this page |
| Every row has media | All exercises require the media. There is no no-media state, so "Instructions and images are on the way." (mockup 34, copy inventory :726) is not used on this page. A program cannot publish without media (see "Publish blocked by missing images (DIDI-1192)") |
| Public page | No tag ("AI video", "AI image" or any replacement) and no clinician, patient or account identifiers. The page shows only what it shows today (Exercise program, program name, intro, Save as PDF, Print, rows and expiry line) plus the row media. Image URLs are public and non-identifying (DIDI-1191) |

### Row layout on screen

Page: `.link-page` column `max-width: 42rem` below 1024 px, unchanged (public-link-page.css :1-5). **Changed:** at `(min-width: 1024px)` the column widens to `max-width: 64rem`, so the carousel has room in the second column. Breakpoint as useMinWidth1024.ts :3. Row box `.link-page-row` and the 1rem row gap are unchanged.

DOM order in every row: `h2` "{title}, {type}" (PublicLinkPage.tsx :103), the carousel, the dose block, then the note (:107). Reading and tab order follow it, so the media comes right after the title at every width (DIDI-594 G update 3).

| Element | Below 1024 px (390 px reference) | 1024 px and up (1280 px reference) |
| -- | -- | -- |
| Row structure | One column: title, carousel (`margin-top: 0.5rem`), dose (`margin-top: 0.75rem`), note (`margin-top: 0.75rem`) | Grid `grid-template-columns: minmax(0, 1fr) minmax(0, 1.25fr)`, gap 1.5rem. Areas: `"title media" "dose media" "note media"`, with the media spanning all rows and top-aligned. The text column holds the title, dose and note |
| Title | `h2` 1rem, weight 600, `#0f172a`, unchanged | same |
| Dose | See "Dose block" | same |
| Note | 0.875rem, line height 1.625, `#1e293b`. Placeholder in the previews: the long sample note in row 1 ("Slow and controlled. Lie on your back...") is sample data, not copy | same |

### Carousel

One per exercise, full width of its column. Slides in order:

| Slide | Content | Name |
| -- | -- | -- |
| 1 | The 6s start to end loop, from ExerciseMotion.tsx and exercise-motion.css unchanged: 4:3 frame `#f1f5f9`, crossfade and drift (`--exercise-motion-loop-duration`, timing.ts :2), progress bar 0.25rem, 2.75rem round white "Pause video" / "Play video" button inset 0.75rem | "Video" |
| 2 | The Start image, 4:3, `object-fit: cover` | "Start" |
| 3 | The End image, 4:3, `object-fit: cover` | "End" |

Frame: `border-radius: 0.75rem`, 4:3, background `#f1f5f9` (exercise-motion.css :42-47).

**Swipe and snap ("smooth and snappy").** The track is a horizontal scroll container with `scroll-snap-type: x mandatory`, `overscroll-behavior-x: contain` and a hidden scrollbar. Each slide is `flex: 0 0 100%` with `scroll-snap-align: start` and `scroll-snap-stop: always`, so one swipe moves one slide and it always settles on a slide. Moves from the indicators, the chevrons or the arrow keys call `scrollTo` with `behavior: "smooth"` (the browser's own smooth scroll, no new timing value). Indicator colour changes use the existing `0.15s ease` (shell.css :119-121).

**Indicators.** Under the frame, centred, `margin-top: 0.5rem`, gap 0.25rem: three native buttons, each a 44 px round hit target (2.75rem).
- Indicator 1 (video slide): the existing `PlayIcon` path from ExerciseMotion.tsx :34-40 (viewBox 0 0 14 14) drawn at 10 px, `fill: currentColor`.
- Indicators 2 and 3: an 8 px round dot (0.5rem).
- Current slide: filled teal-700 `#0f766e`. Others: slate-300 `#cbd5e1`. The current dot keeps the same round shape and size; only the fill changes. It never stretches into a pill.
- Names: "Video", "Start", "End". The current one has `aria-current="true"`.
- Under the indicators, on slides 2 and 3 only, the visible caption "Start" or "End" (0.75rem, `#64748b`).

**Chevrons (1024 px and up only).** Previous and Next sit inside the frame, vertically centred, inset 0.25rem from each edge.
- Bare chevron icons (24 px, stroke 2) in slate-500 `#64748b`, hover slate-700 `#334155`. No circle, no background and no shadow, so they are clearly lighter than the Play/Pause button.
- Each is a native button with a 44 px hit target, named "Previous" / "Next".
- On slide 1 Previous is hidden and disabled; on slide 3 Next is.
- Below 1024 px there are no chevrons: swipe and the indicators.

**Focus ring.** Every focusable part of the carousel (the frame, the indicators, the chevrons, the Pause/Play button) uses the existing ring: 2px `#0f766e` with a 2px offset (exercise-motion.css :108-111, :180-181). It is drawn around the 44 px target of whichever control has focus, separate from the current-slide fill. So a focused, non-current dot shows a ring around a grey dot.

### Dose block

Three lines, each a block, made from the existing readout phrases (`paramPhrase`, src/domain/format-exercise-params.ts). Phrases keep `formatExerciseParams`' display order within a line and are joined by ", ". An empty line is left out.

| Line | Fields | Example |
| -- | -- | -- |
| 1 | reps, hold_s, ascent_s, descent_s | **15** reps, **2s** hold |
| 2 | sets, rest_s | **3** sets, **60s** rest between sets |
| 3 | days_per_week, per_day | **3x** a week / **every day** |

- Type: 1rem, line height 1.375, words slate-600 `#475569`.
- The number part of each phrase (for example "15", "2s", "3x") is weight 600, slate-900 `#0f172a`, with tabular figures. A phrase with no number ("every day", and the per-day phrases "once a day", "twice a day") is bold as a whole.
- Bold is visual only; the text reads the same to a screen reader.
- Diadem wrote "everyday"; the existing string is "every day" and is used verbatim.

### States

| State | When | Screen | Print |
| -- | -- | -- | -- |
| Default | Both images loaded, motion allowed | Carousel on slide 1, loop playing | Text, Start, End |
| Paused | The user pressed "Pause video", or Enter or Space on the frame while slide 1 shows | The loop holds its frame and the round button shows the play icon, named "Play video" | Same as default |
| Reduced motion | `prefers-reduced-motion: reduce` | Slide 1 shows the Start image still, alt "{title}, start position", with no loop, no progress bar and no Pause/Play button. Moves jump (`behavior: "auto"`), with no colour transition. The three slides and indicators stay | Same as default |
| Load failed | Either image fails to load (`error` event) | In place of the carousel: a box with a dashed slate-300 border, background slate-50 and radius 0.75rem, containing "Images didn't load." (0.875rem, slate-700) and the link button "Try again" (accessible name "Try loading images for {title} again", 44 px target, teal-800, weight 600). No indicators, no chevrons, no broken image icon | Text in column 1; "Images didn't load." in one cell spanning columns 2 and 3 |
| Keyboard focus | A carousel control has focus | Focus ring as above | n/a |

There is no no-media state: "all exercises require the media" (Diadem, Nov 9, 2026, 11:26 AM ET).

The loop plays only while slide 1 is the current slide. Leaving slide 1 pauses it. Coming back resumes it unless the user had paused it, in which case it stays paused.

### Keyboard, focus and names

- The frame is `role="group"` named "{title}", with `tabIndex={0}`. With focus on it, Left and Right Arrow move one slide. On slide 1, Enter or Space plays or pauses the loop (as ExerciseMotion.tsx :60-72).
- Each slide is `role="group"` named "Video", "Start" or "End". Slides that are not current get `aria-hidden="true"` and `inert`, so Tab never reaches a hidden slide's button. Note: the MagicPath prototype names the slides "1 of 3"; that string is not approved and is not used.
- Tab order: frame, then the Pause/Play button (slide 1 only, when motion is allowed), then Previous and Next (1024 px and up, when shown), then the three indicators.
- Indicators and chevrons are native buttons. Enter or Space activates them, and focus stays on the pressed control.
- Pause/Play: native button named "Pause video" while playing and "Play video" while paused (src/ui/copy/a11y.ts :6-7).
- Alt text: Start image "{title}, start position", End image "{title}, end position", on the loop's layers and on slides 2 and 3 (timing.ts :16-22).
- "Try again": after a successful retry focus moves to the new carousel frame; if it fails again focus stays on "Try again".
- No live announcement on slide change: the current indicator's `aria-current` and the slide names are enough.

### Print and Save as PDF (DIDI-1195)

Uses the existing `@media print` block (public-link-page.css :87-103). The header (Exercise program, program name, intro) prints as today. Save as PDF and Print stay hidden (`link-page-no-print`).

| Element | Print |
| -- | -- |
| Row | Grid `grid-template-columns: minmax(0, 1fr) 11rem 11rem`, gap 0.75rem, `break-inside: avoid` |
| Column 1 | Title (15px, weight 600), dose block (13px, the same three lines and bold numbers), note (12px, line height 1.625) |
| Columns 2 and 3 | Start and End images, 4:3, `object-fit: cover`, radius 0.75rem, with captions "Start" / "End" (0.75rem, `#64748b`, 0.25rem above) |
| Load failed | Column 1 as above. Columns 2 and 3 merge into one cell (`grid-column: 2 / 4`) with a dashed slate-300 border and radius 0.75rem, min height equal to the image height (8.25rem), with "Images didn't load." (13px, slate-500) centred. No "Try again" |
| Not printed | The loop, carousel controls, indicators, chevrons, Pause/Play, and the expiry footer |

**Expiry line in print (CTO, Nov 9, 2026; DIDI-594 G update 3).** `This link works until {exp.date}.` and `This link stays open until your physiotherapist closes it.` (copy inventory :728-729) stay on the web page and are removed from print and PDF only. Add `link-page-no-print` to `.link-page-footer` (PublicLinkPage.tsx :112), or hide it in the print block.

**Note for Developer: DIDI-1015 print test.** CTO says the DIDI-1015 print test expects a footer expiry line, so that test needs updating with this change. I could not find a print-specific footer assertion on 92ebb26:
- `test/ui/public-link-page.test.tsx` asserts the on-screen line "This link stays open until your physiotherapist closes it." (:91, fixture :44 and :205). Those stay valid, because the line stays on screen.
- The print stylesheet test (:259-266) checks `@media print`, `.link-page-no-print { display: none }`, `.link-page-row { break-inside: avoid }` and no "exercise-motion" in the print CSS. It says nothing about the footer.
- Confirm with CTO which assertion is meant before changing tests. Keep "exercise-motion" out of the print CSS: the print rules for the images belong in public-link-page.css.

### Notes for Developer (DIDI-1191, DIDI-1195)

- PublicLinkExerciseVideo.tsx (:12-15) holds "Play video", "Show images", "Start" and "End". The carousel replaces the "Play video" / "Show images" toggle on this page. Drop the placeholder fallback (:23-26).
- Wire `myDefaultsPendingCopySlots` (src/ui/copy/my-defaults-pending-copy.ts) to the approved fragments so "1 set" and "{n} sets" render. Today `paramPhrase` returns "" for sets, so the live line drops them (DIDI-1130 wiring gap).
- The 64rem desktop width applies to the link page only.

## Publish blocked by missing images (DIDI-1192)

Diadem, Nov 9, 2026, 11:27 AM ET, verbatim (locked on DIDI-594, entry E): "every exercise already gets images but we can add the rule as a backup failsafe"

Diadem, Nov 9, 2026, 11:26 AM ET, verbatim: "all exercises require the media"

Copy approved by Diadem, Nov 9, 2026, 11:31 AM ET, verbatim: "Yes, approve all six strings". Design: https://designs.magicpath.ai/v1/tender-storm-9323 (MagicPath project 470575340046131200, component 470578831170871296, revision 470578831170871297). Unchanged by the E7 rework (DIDI-594 G: "F's six approved strings and CTO's failsafe rulings on DIDI-1193 still stand").

This is a failsafe. Every exercise is expected to have both images, so in normal use this notice never shows.

### Rule (CTO technical rulings, Nov 9, 2026, DIDI-1193)

| Case | Behaviour |
| -- | -- |
| Any exercise in the program or routine lacks its start or end image | Publish is blocked. The exercise is never published without its images and never silently left out |
| Where it applies | Both sheets: the program "Publish to the live link?" sheet (first publish, republish and Use for a patient) and the routine "Publish this routine?" sheet |
| Who enforces it | The server, on every publish request, whichever sheet sent it |
| Check when the sheet opens | Advisory UI only: it shows the notice early. The server check when Publish now is pressed is the one that counts. If the server rejects a publish the sheet did not predict, the sheet shows the same notice and Publish now becomes disabled |
| Placeholders and missing images together | The notices stack: the placeholder notice (DIDI-1186) first, then this one. Publish now stays disabled until both are cleared |
| Actions | Remove only, the same action as the row's existing "Remove {name}" (ProgramBuilderRowCard.tsx :304, `removeRowAriaLabel` in src/ui/copy/programs.ts :333). No Regenerate |
| Blocked publish | Writes nothing: the live snapshot and live link stay unchanged, no link is created or updated, and expiry is not applied (DIDI-1189) |
| All cleared | The heading switches to the check icon line, and Publish now follows every other publish requirement (for example "Name required") |

### Where it shows

The same position and component as the DIDI-1186 notice: directly under the program card in "Publish to the live link?", or under the routine card in "Publish this routine?".

Program sheet, in order:
1. Heading with the alert icon: "Remove exercises without images to publish".
2. Body: "{n} exercises are missing their start or end image. Remove them from this program, then publish." For one: "One exercise is missing its start or end image. Remove it from this program, then publish."
3. One list item per affected exercise: the exercise name and the Remove icon button ("Remove {name}"). No badge and no Review draft, because these exercises are approved.
4. Republish only: "Not live yet. Your patient still sees the version published {pub.at}."

When the last affected exercise is removed, the heading switches to the check icon (text-teal-700) and "No exercises without images left. You can publish.", and the body and list go away.

Routine sheet ("Publish this routine?"): the heading, the list with "Remove {ex.name}" (routines copy inventory :433) and the cleared line "No exercises without images left. You can publish." show, exactly as on the program sheet. The two body strings say "this program", so they do not show on the routine sheet. See Open items.

### 390 px and 1280 px

Every token is the DIDI-1186 one ("Publish blocked by placeholders (DIDI-1186)", 390 px and 1280 px table), unchanged:
- Notice container `mt-3 rounded-2xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900`.
- Heading `flex items-start gap-1.5 font-semibold`, icon `mt-0.5 h-4 w-4 shrink-0`.
- List `mt-2 divide-y divide-amber-200`, rows `flex flex-wrap items-center gap-2 py-2`. Remove is `iconBtn` with a 44 px target.
- Republish line `mt-2 text-xs text-amber-800`.
- Disabled Publish now `disabled:cursor-not-allowed disabled:opacity-50`.
- When both notices show, the second one keeps `mt-3`.

### Accessibility

- The notice is a section with `role="status"` and `aria-labelledby` on its heading, as in DIDI-1186, so it is announced politely after the sheet title.
- Publish now is `disabled` while any affected exercise remains, with `aria-describedby` pointing at this notice's id. When both notices show, `aria-describedby` lists both ids, placeholders first. Once this list is empty, its id is removed.
- Program sheet: after a removal the polite live region says "Removed {name} from this program."; when the list empties it also says "No exercises without images left. You can publish."
- Routine sheet: when the list empties the live region says "No exercises without images left. You can publish.". There is no per-removal read-out until a routine string is approved (see Open items).
- Focus after Remove: moves to the next row's Remove (or the previous one if it was the last row). When the list empties, focus moves to the notice heading (`tabIndex={-1}`).
- If the server rejects Publish now: focus moves to the notice heading.

### Open items

- Routine sheet wording. The approved body strings ("Remove them from this program, then publish." / "Remove it from this program, then publish.") and the removal read-out "Removed {name} from this program." name the program, so they don't fit "Publish this routine?". No routine version is approved, and none is added here. The routine sheet shows the heading, list and cleared line only. A routine body or removal read-out needs Diadem's approval.

## Mockups

Changed in DIDI-1152 (approved Oct 31, 2026): builder reorder, 35 to 37 below. Changed in v12 (the approved v12 previews): 21 to 25. Rendered from the approved revision for the rest (v11 states 01 to 08 and 26, and earlier states unchanged since v10).

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
| 35 builder reorder rest (DIDI-1152) | [phone](mockups/didi-1152-01-reorder-rest-phone.png) | n/a |
| 36 builder reorder rest annotated (DIDI-1152) | [phone](mockups/didi-1152-02-reorder-rest-annotated-phone.png) | n/a |
| 37 builder reorder dragging (DIDI-1152) | [phone](mockups/didi-1152-03-reorder-dragging-phone.png) | n/a |
| 38 link page exercise media (DIDI-1192, E7) | [phone](mockups/didi-1192-01-link-media-phone.png) | [desktop](mockups/didi-1192-02-link-media-desktop.png) |
| 39 link page print and PDF (DIDI-1192, E7) | [print](mockups/didi-1192-03-link-media-print.png) | n/a |
| 40 carousel keyboard focus on an indicator (DIDI-1192, E5) | [phone](mockups/didi-1192-04-carousel-focus-phone.png) | n/a |
| 41 publish blocked by missing images (DIDI-1192) | [phone and desktop](mockups/didi-1192-05-publish-blocked-missing-images.png) | see phone |


Mockups 38 to 41 (DIDI-1192): MagicPath E7 https://designs.magicpath.ai/v1/keen-current-4842 (component 470769311091429376, revision 470770451010957312), E5 focus state https://designs.magicpath.ai/v1/peaceful-path-6380 (component 470763380744007680, revision 470763380744007681), failsafe https://designs.magicpath.ai/v1/tender-storm-9323 (component 470578831170871296, revision 470578831170871297), project 470575340046131200. Rows in 38 and 39, top to bottom: default, keyboard focus, paused, reduced motion, load failed. Row 1's long note is a placeholder, not copy.

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

**DIDI-594 description, "Real exercise media on the public link page" through "G update 4" (LOCKED, Nov 9 and 10, 2026)** (https://linear.app/didi-build/issue/DIDI-594), verbatim quotes:

> **C.** Diadem, Nov 9, 2026, 11:12 AM EST: "let's start this"
>
> **D.** Diadem, Nov 9, 2026, 11:25 AM ET: "Video means the start and end image transition, nothing new"; "No media: text only" (SUPERSEDED at 11:26 AM by "all exercises require the media").
>
> **E.** Diadem, Nov 9, 2026, 11:27 AM EST: "every exercise already gets images but we can add the rule as a backup failsafe"
>
> **F.** Diadem, Nov 9, 2026, 11:31 AM EST. Layout: "go with D but I want the transition between images and videos to be smooth and snappy" (layout SUPERSEDED by G). Copy: "Yes, approve all six strings".
>
> **G.** Diadem, Nov 9, 2026, 12:42 PM EST: "let's rework the design. I think in the link we just have 1 carousel. the video is first, they can scroll to the individual images. when it is printed out,pdf, the video is no longer needed so we see both images inline"
>
> **G update.** Diadem, Nov 9, 2026, 11:10 PM EST: "e2 for print.
>
> for the carousel, I like e1 but for the dot that represents a video, could we use a video symbol ? for example ▶️"
>
> **G update 2.** Diadem, Nov 9, 2026, 11:41 PM EST: "- why is the selected icon (when keyboard focus) a line and not a dot?
>
> \- the left/right arrows on the desktop feels too similar in visual weight as the play/pause button. can the left/right arrows look different? aka not in a circle with a white background. more subtle
>
> \- for the print version, can we actually do the images in 1 column on the left? all the text on the right. especially because the notes/descriptions might be longer"
>
> **G update 3.** Diadem, Nov 9, 2026, 11:53 PM EST: "- this looks great
>
> \- minor change, for mobile and desktop, can the media come before the set/reps&notes? (still after the title)
>
> \- I changed my mind about the print layout. 3 columns; text, first image, second image.
>
> \- in the print we have a line in the footer "think link works until xxx" which doesn't make sense in a print or pdf
>
> \- the desktop version, I'd like 2 columns; test, carousel
>
> \- for all of them, can we display the sets/reps/hold, 3x a week line differently? give me 3 variants. I want it to be glanceable and easy to read"
>
> Designer's reading (not Diadem's words): "test" is a typo for "text"; the expiry line (approved Oct 25, 2026, 7:22 PM ET) stays on the web page and is removed from print and PDF only.
>
> **G update 4.** Diadem, Nov 10, 2026, 12:05 AM EST: "E6c sentences, but put "3x a week"/"everyday" on its own new line"

> **G update 5.** CTO locked (is/was comment b0a593dc on DIDI-594). Diadem, Nov 10, 2026, 12:08 AM ET: "Yes, approve E7"; 12:09 AM ET: "yes I approve. and one more minor detail. on the print version, "images didn't load" should go on the images column (a merged column 2 and 3)". Together these approve the E7 layout and the strings "Video", "Previous" and "Next". The final E7 design is https://designs.magicpath.ai/v1/keen-current-4842, revision 470770451010957312.

| Topic | Was | Is |
| -- | -- | -- |
| Video on the link page | Unclear whether a new video asset | The existing start to end image transition; no new asset (D) |
| No media | Mockup 34's "Instructions and images are on the way.", then briefly "No media: text only" | No no-media state; every published exercise has both images (11:26 AM) |
| Publish without media | Unresolved | Failsafe block on both publish sheets, server-enforced (E) |
| Screen layout | D: stills with a "Play video" toggle, text left and media right from 1024 px (F) | One carousel, video first, then Start, then End (G); E1 dots with a play symbol (G update); media right after the title; 2 columns on desktop (G update 3) |
| Print and PDF | D: stills beside the text; then E2 side by side (G update); then images stacked left (G update 2) | 3 columns: text, Start, End; no video; no expiry line (G update 3) |
| Dose line | One line | E6c sentences with the frequency on its own line (G update 4) |

Approvals of the final design (DIDI-1192 comment 98568f51): Diadem, Nov 10, 2026, 12:08 AM ET, "Yes, approve E7"; 12:09 AM ET, "yes I approve. and one more minor detail. on the print version, "images didn't load" should go on the images column (a merged column 2 and 3)".

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
- Try saving again
- 1 exercise, sent {date}
- {n} exercises, sent {date}
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
- Reorder {r.name}, position {i + 1}. Press and hold, then drag. Or use the arrow keys. (Replaced by the approved grip name, DIDI-1152; see Builder reorder)
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


### Missing from the inventory above (approved v12 source, WebAppClickableConcept.tsx line 1305)

- Moving {name}. Release to drop it in place {n}.

### Approved Oct 31, 2026, 1:28 PM and 1:30 PM ET (DIDI-1152)

- Reorder {name}, position {n}. Press and hold, then drag. Or hold Shift and use the arrow keys.
- {name} moved to position {n} of {total}
- Move {name} up (screen reader only)
- Move {name} down (screen reader only)

### Approved Nov 8, 2026, 1:56 PM ET (DIDI-1186)

- Approve or remove placeholders to publish
- {n} exercises are placeholders. Approve each draft or remove it from this program, then publish.
- One exercise is a placeholder. Approve each draft or remove it from this program, then publish.
- Review draft
- Review draft for {name} (accessible name)
- Removed {name} from this program.
- No placeholders left. You can publish.

### Approved Nov 9, 2026, 11:31 AM ET (DIDI-1192)

- Images didn't load.
- Try loading images for {title} again (accessible name)
- Remove exercises without images to publish
- {n} exercises are missing their start or end image. Remove them from this program, then publish.
- One exercise is missing its start or end image. Remove it from this program, then publish.
- No exercises without images left. You can publish.

### Approved Nov 10, 2026, 12:09 AM ET (DIDI-1192)

- Video (accessible name of the carousel's first indicator and slide)
- Previous (accessible name)
- Next (accessible name)

### Reused on the link page (DIDI-1192), unchanged

- Start / End (captions, indicator names and slide names)
- Pause video / Play video (src/ui/copy/a11y.ts :6-7)
- {title}, start position / {title}, end position (alt text, timing.ts :16-22)
- Try again
- Dose phrases from `paramPhrase` (src/domain/format-exercise-params.ts): "1 rep" / "{n} reps", "{n}s hold", "{n}s down", "{n}s rest between sets", "${n}x a week" (days per week other than 7), "every day" (7 days per week)
- "1 set" / "{n} sets": approved by Diadem, Nov 6, 2026, 7:44 PM ET (DIDI-1130, comment c10b1de4; design/app/settings-link-expiry/spec.md "Dose readout fragments"). The code slots are still empty on main (src/ui/copy/my-defaults-pending-copy.ts), a wiring gap, not an approval gap.
- "once a day", "twice a day", "{n} times a day", "{min} to {max} times a day" and "{n}s up": in the same Nov 6 block, but their code slots are still empty on main, pending the DIDI-1130 wiring. They are out of scope for this design and not shown in the mockups. When wired, the per-day phrases go on dose line 3 and "{n}s up" on line 1.

Not printed (DIDI-1192, CTO, Nov 9, 2026): "This link works until {exp.date}." and "This link stays open until your physiotherapist closes it." stay on the web page only. "Show images" and "Instructions and images are on the way." are not used on the link page.

## Changes

- **Nov 10, 2026**: DIDI-1192. Diadem approved E7: "Yes, approve E7" (12:08 AM ET), and "Video", "Previous" and "Next" with the print detail (12:09 AM ET). The link page shows one carousel per exercise (the start to end loop, then Start, then End) with round dots, a play-triangle dot, a separate focus ring and subtle chevrons from 1024 px. On phone: title, carousel, dose, notes. From 1024 px: text left, carousel right, page 64rem (was 42rem). The dose is three lines with bold numbers, frequency last. Print and PDF: text, Start, End in three columns, "Images didn't load." across the image columns, no video, no controls, no expiry line. Missing start or end images block publish on the program and routine sheets, server-enforced, Remove only (CTO rulings, DIDI-1193; copy approved Nov 9, 11:31 AM ET). Supersedes variant D (Nov 9, 11:31 AM ET). https://linear.app/didi-build/issue/DIDI-1192, https://linear.app/didi-build/issue/DIDI-594

- **Nov 8, 2026**: DIDI-1186. Diadem (1:45 PM ET, locked on DIDI-594): "Block publish until every placeholder is approved or removed." Variant D, "Go with D" (1:55 PM ET); copy, "Yes, approve all of D's wording" (1:56 PM ET). Locked by CTO, comment b196ba23. The Publish sheet lists placeholders with Review draft and Remove; Publish now stays disabled while any remain and still follows every other publish requirement; Review draft never approves; a blocked publish leaves the live snapshot and link unchanged. https://linear.app/didi-build/issue/DIDI-1186, https://linear.app/didi-build/issue/DIDI-594
- **Nov 7, 2026**: DIDI-1178. Diadem (America/Toronto, locked on DIDI-594): on the Programs list, search and origin filters stay above empty-state messaging during initial loading, zero programs and zero matches, the same pattern as the Exercises page. https://linear.app/didi-build/issue/DIDI-1178
- **Oct 31, 2026**: DIDI-1152. Diadem (1:19 PM ET): keep drag and drop, add Shift with the up and down arrow keys. Diadem (1:28 PM ET): approved the grip name and the move read-out, removed the up and down buttons, hint unchanged. Diadem (1:30 PM ET): screen reader only "Move {name} up" and "Move {name} down" actions on the grip. https://linear.app/didi-build/issue/DIDI-1152
- **Oct 31, 2026**: Spec alignment: the library updates flag reads "1 library update to review" for one and "{n} library updates to review" for more, as in approved mockups 01, 29 and 05. https://linear.app/didi-build/issue/DIDI-1144
- **Oct 30, 2026**: DIDI-1134. Diadem approved the copy for empty states, save failure and singular counts (1:39 PM ET) and the leave warning (1:41 PM ET). https://linear.app/didi-build/issue/DIDI-1134
- **Oct 23, 2026**: First concept: builder, share with PDF preview and delete. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: Per-program expiry with Never; closing a link keeps the program; link page with Save as PDF. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: DIDI-827 to DIDI-829: same link shows the latest published version; delete with confirm, restorable 30 days; save and publish separate; library update prompt. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-827, https://linear.app/didi-build/issue/DIDI-828, https://linear.app/didi-build/issue/DIDI-829
- **Oct 25, 2026**: v10 comments #14, #15, #17: sticky floating publish card on tablet and desktop; Publish is the share action; auto-save. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v11: program name and code, Programs search by name or code, filters by origin, New program from a routine or from scratch, builder from a routine, 1 year default expiry. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-852, https://linear.app/didi-build/issue/DIDI-851
- **Oct 25, 2026**: v12: program name required with an inline error; Use for a patient lands on the Publish sheet; Not yet keeps a draft. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-852
- **Oct 25, 2026**: v12 approved by Diadem (7:22 PM ET). Dev: https://linear.app/didi-build/issue/DIDI-810. https://linear.app/didi-build/issue/DIDI-809
