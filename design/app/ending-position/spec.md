# Ending position text

Area: app · Feature: ending-position

## Purpose

Every exercise gets an **Ending position** text right after **Starting position** in the fixed text template. Both texts sit together in one **Positions** card, each next to a small thumbnail of its own still. This applies to draft review (editable, read-only and Generating), Edit for everyone, Edit my copy, library details and version history. Patients see both texts, plus the exercise's description, on the share link page and in print and PDF.

The text describes only the body parts the exercise moves, to match start and end images in which only those parts change.

Parent flows stay in [exercise-requests/spec.md](../exercise-requests/spec.md) (request, review, approve), [draft-review-ai-states/spec.md](../draft-review-ai-states/spec.md) (generation states), [exercise-library/spec.md](../exercise-library/spec.md) (details, Edit for everyone, My copy, version history) and [programs/spec.md](../programs/spec.md) (share link page, print and PDF). This spec only adds the positions texts and the patient description.

**Matches Product direction: yes.** Checked against [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) comments `5a6fd98b`, `ac1c42dd`, `a46e01d7`, `9a307ad9` and `4506b55d`, plus [DIDI-1264](https://linear.app/didi-build/issue/DIDI-1264) comment `3a015c51`. **Is/was:** CTO's pick on `5a6fd98b` was an Ending position **section of its own** right after Starting position. Diadem replaced it with "B and C combined" (Nov 22, 2026, 3:31 PM EST, `a46e01d7`): one shared **Positions** card holding Starting position then Ending position, with a still thumbnail for each. Ending position still comes right after Starting position everywhere and is edited the same way.

## Product direction (verbatim)

**Diadem, CTO chat, Nov 21, 2026, 10:16 PM EST** (locked on DIDI-594 `5a6fd98b`):

> "it's good that it works now. but 2 things: - the start and end image are almost identical. they do not properly show the start and end positions the exercises. - we have a starting position description but not an ending position description??"

The fixed text template adds **ending position** right after starting position. CTO picks on `5a6fd98b` (not Diadem's words): legacy versions with an empty ending position fall back to the exercise's last step **for the image prompt only**, and the UI never shows that fallback as ending-position text.

**Diadem, CTO chat, Nov 21, 2026, 10:23 PM EST** (locked on DIDI-594 `ac1c42dd`):

> "since we're going to change how we generate the images, I want to add one more constraints: *only* the movement relevant to the exercise should differ in the start and end images. for example, in the sumo squat images, the arm should not have moved"

CTO note on DIDI-1264 `3a015c51`: the figure and scene stay identical across the pair (figure, clothing, camera angle, background, lighting and style), and only the body parts involved in the movement change.

**Diadem, Designer's chat, Sun Nov 22, 2026, 3:31 PM EST**, verbatim answers (locked on DIDI-594 `a46e01d7`):

1. Which layout? "B and C combined"
2. Should patients see the starting and ending position text on their share link and PDF? "Yes, show starting and ending position text to patients"

**Diadem, Designer's chat, Mon Nov 23, 2026, 1:00 AM EST**, verbatim (locked on DIDI-594 `9a307ad9`):

> "approve the strings.
>
> approve the draft review.
>
> the patient link and the pdf/print view are missing the exercise high level description"

**Diadem, Designer's chat, Mon Nov 23, 2026, 1:42 PM EST**, verbatim (locked on DIDI-594 `4506b55d`):

> "Yes, approve the patient link and PDF views"

CTO picks on `9a307ad9` and `4506b55d` (not Diadem's words): the description and both position texts come from the **pinned exercise version** (frozen with the program). An empty description or an empty ending position shows **nothing** to patients, with no fallback and no placeholder.

## Design source (approved Nov 23, 2026)

| Choice | MagicPath link | Component id | Revision |
| -- | -- | -- | -- |
| D. B and C combined (final) | https://designs.magicpath.ai/v1/keen-garden-5264 | 475351515939344384 | 475494418896523264 |

- Strings E1 to E7 and the draft review views: approved Nov 23, 1:00 AM EST on revision `475351783762440192`. That revision's practitioner tabs are unchanged in `475494418896523264`.
- Patient link page and Print and PDF: approved Nov 23, 1:42 PM EST on revision `475494418896523264`.

Project: [DIDI-1282 Ending position](https://www.magicpath.ai/files/475093310759903232). Source: `Board.tsx` with `v="D"`. One frame with tabs: Draft review, Generating, Old draft no ending, Edit for everyone, Library details (older-version toggle), Version history, Patient link page and Print and PDF (toggle: row 2 is an older exercise with no ending position and no description).

Exploration only, not for build:

| Variant | Link | Component id | Revision |
| -- | -- | -- | -- |
| Baseline (main today) | https://designs.magicpath.ai/v1/mighty-lake-5407 | 475093998873223168 | 475093998873223169 |
| A. Own section | https://designs.magicpath.ai/v1/radiantly-hour-1555 | 475093805398376448 | 475093805398376449 |
| B. Paired Positions block | https://designs.magicpath.ai/v1/sunny-land-1202 | 475094057463455744 | 475094057463455745 |
| C. Own section with still | https://designs.magicpath.ai/v1/warm-shadow-9421 | 475094120680009728 | 475094120680009729 |

**Mockup caveats:**

- Amber dashed highlights and E numbers mark new strings in the mockups only. Build uses the normal label styling with no highlight.
- Small grey notes in the frames that name a string id or a rule are design annotations, not copy.
- The tabs and toggles at the top of each frame are design-preview chrome, not product UI.
- Sample data (exercise names, position text, description, dose, notes, "Kojo", "Amira", program name) is not copy. The glute bridge row reuses the heel slide stills.

## The Positions card (practitioner surfaces)

| Topic | Rule |
| -- | -- |
| Structure | One card (1px slate-200 border, radius 1rem, padding 0.75rem) with heading E3, then an ordered list of two steps: **Starting position**, then **Ending position** (E1). A teal step marker sits on the left of each: an open ring for the start and a filled dot for the end, joined by a 2px teal-200 line. The markers are decorative (`aria-hidden`). |
| Thumbnails | Each step shows a 56 px square thumbnail of its own still (the start still for Starting position, the end still for Ending position), radius 0.5rem, 1px slate-200 border, `object-fit: cover`, to the left of the text. Decorative: `alt=""`. When a still doesn't exist yet (Generating) or failed to load, leave the thumbnail out and let the text take the full width. |
| Order | Starting position, then Ending position, always. In draft review the card follows **Basics** in **Exercise details**. At 1280 px it stays in the left text column of the existing review grid. |
| Helper | E4 sits under the heading, **only in editable states** (editable draft review, Edit for everyone, Edit my copy). Both textareas reference it with `aria-describedby`. It is not shown in read-only or Generating states, in library details or to patients. |
| Edit pattern | Same as `DraftTextField` today: a label row with the field label and an **Edit {label}** link (E2 for Ending position), then the text. Edit opens an inline multiline textarea with **Save** and **Cancel**. Save writes the field; Cancel restores the value. |
| Movement rule | Placeholder E5 and helper E4 describe only the moving body parts. They never mention clothing, scene, equipment placement or the figure (`ac1c42dd`). |

## States per surface

### Draft review

| State | What shows |
| -- | -- |
| Ready, editable | Positions card with E3, E4, Starting position (Edit Starting position) and Ending position (E2), each with its thumbnail. Mockups 01, 01 desktop. |
| Editing Ending position | The Ending position step becomes the inline editor: label E1, thumbnail, textarea (`rows=4`, placeholder E5 when empty), Save, Cancel. Focus moves into the textarea. Mockup 02. |
| Read-only | Same card with no Edit links and no E4. |
| Generating (first draft) | Until text exists, **Exercise details** shows **Generating** as today. Once text exists, the card shows both texts read-only with no Edit links and no E4, and no thumbnails until the stills exist (draft-review-ai-states rule: no Edit or Edit all until the first draft is ready). Mockup 03. |
| Old draft, no ending position | The Ending position step shows a dashed slate-300 box with E6 and the link E7. No Edit link. The last-step fallback is never shown. Mockup 04. |
| Adding | E7 opens the same inline editor, empty, with placeholder E5. Save writes the field; Cancel returns to E6 and E7. Mockup 05. |

### Edit for everyone

The form keeps its current fields. Starting position and Ending position move into one `fieldset` with legend E3 and helper E4 (linked to both textareas), each textarea next to its thumbnail. Ending position is empty with placeholder E5 on an older version. Editing either shows the existing **Changed** badge and enables **Save as version {N}** as today. Saving makes the next version for every practitioner. Mockups 06, 06 desktop and 07.

### Edit my copy

There is no new layout. Ending position is a per-field private edit exactly like Starting position, using the existing My copy pattern ("Edited", "Reset {label} to the library version", "Library updated", "Library now:", "Use library version", "Keep mine"), with E1 as the label. The Positions card shape, E4 and E5 apply in the editor. No mockup: it follows the existing My copy screens in exercise-library.

### Library details

A read-only Positions card (heading E3, both steps with thumbnails, no helper) sits after the Start and End images and before **How to do it**. Both texts are visible to every practitioner (`5a6fd98b`, "in the library details"). Mockups 08 and 08 desktop.

**Older version with no ending position:** the Ending position step shows E6, and E7 appears under the card for anyone who can edit. E7 opens **Edit for everyone** with focus in the Ending position textarea. Mockup 09.

### Version history

A version that changed the ending position lists E1 among its changed fields, in the same chip style as the other field names. Restore works as today. Mockup 10.

### Patient share link page

Matches the link page rules in [programs/spec.md](../programs/spec.md), "Link page exercise media (DIDI-1192)". No tag, no clinician, patient or account identifiers.

| Topic | Rule |
| -- | -- |
| Row order, below 1024 px | Title (`h2` "{title}, {type}"), **description**, carousel, **Starting position** and **Ending position**, dose block, note. Mockup 11. |
| Row order, 1024 px and up | The text column holds title, description, positions, dose and note; the carousel spans the right column as today. Mockup 11 desktop. |
| Description | The pinned version's `description` field (the same field library details shows under the title, `ExerciseDetailsPage.tsx:129-131, :172`). Unlabelled paragraph, 15px, line height 1.625, slate-700, 0.25rem under the title. |
| Positions | A definition list (`dl`): `dt` "Starting position" and `dt` E1, each followed by its text in a `dd` (15px, slate-700). Uses the same open-ring and filled-dot step markers (decorative). There is **no** E3 heading, **no** E4 helper and **no** thumbnails, because the carousel already shows Start and End. 0.75rem above the block. |
| No ending position | The Ending position `dt` and `dd` are left out; Starting position still shows. Patients never see E6 or E7, and never the last-step fallback. Mockup 12. |
| No description | The paragraph is left out, with no placeholder and no label. Mockup 12. |
| Source | The description and both position texts come from the pinned exercise version, like the media. |

### Print and PDF

Matches "Print and Save as PDF (DIDI-1195)" in programs/spec.md: three columns, text then Start then End, expiry line not printed.

| Topic | Rule |
| -- | -- |
| Column 1 | Title (15px, weight 600), **description** (12px, line height 1.625), **positions** (labels 12px weight 600, text 12px), dose block (13px), note (12px). Mockups 13 and 13 desktop. |
| Columns 2 and 3 | Start and End stills with captions, unchanged. |
| No ending position, no description | Same omissions as the link page. Mockup 14. |
| Page breaks | `break-inside: avoid` on the row, unchanged. |

## Copy

### New strings (approved Nov 23, 2026, 1:00 AM EST)

Wording is Designer picks under Diadem's standing rule (Nov 21, 2026, 12:58 AM EST, verbatim: "going forward please pick something reasonable. only ask me if it's a true product decision that you are unsure about"), recorded on DIDI-1282 comment `7e9ad211`. Diadem approved all seven: "approve the strings." (`9a307ad9`).

| Id | String | Where |
| -- | -- | -- |
| E1 | Ending position | Field label and step label (practitioner surfaces); `dt` on the link page and in print; changed-field name in version history |
| E2 | Edit Ending position | Edit link for the Ending position field (from the existing `Edit {label}` pattern); also its accessible name |
| E3 | Positions | Card heading in draft review and library details; fieldset legend in Edit for everyone and Edit my copy |
| E4 | Describe only the body parts that move in this exercise. Everything else stays as in the starting position. | Helper under E3, editable states only |
| E5 | For example: knee bent, heel slid in toward the buttock | Ending position textarea placeholder |
| E6 | Not added yet. | Practitioner empty state for an older draft or version with no ending position |
| E7 | Add ending position | Practitioner empty-state action |

### Reused

**Starting position** (also new on the link page and in print), **Edit {label}**, **Save**, **Cancel**, **Changed**, **Save as version {N}**, **Generating**, **How to do it**, **Edit for everyone**, the My copy strings listed above, and the link page strings in programs/spec.md. The patient description has no label, so it adds no string.

Patient-facing text from this spec is only "Starting position" and E1, plus exercise content (description and position texts).

## Accessibility

| Element | Markup / behaviour |
| -- | -- |
| Positions card | `section` labelled by the E3 heading (`aria-labelledby`); the two steps are an `ol`. |
| Edit for everyone, Edit my copy | `fieldset` with `legend` E3; E4 has an id and both textareas use `aria-describedby` to it. |
| Textareas | Each has a visible `<label for>`: "Starting position" and E1. Placeholder E5 never replaces the label. |
| Edit link | Native button, visible text and accessible name E2 ("Edit Starting position" for the other field). On Edit, focus moves to the textarea; on Save or Cancel it returns to the Edit link. |
| Empty state | E6 is plain text; E7 is a native button. After E7, focus moves to the empty textarea. In library details, E7 opens Edit for everyone with focus in the Ending position textarea. |
| Thumbnails | `alt=""` (decorative); the Images card and carousel already carry "{title}, start position" / "{title}, end position". |
| Step markers | `aria-hidden="true"`. |
| Link page and print positions | `dl` with `dt` and `dd`, so screen readers announce each label with its text. |
| Description | A plain `p`, read straight after the `h2` title. |
| Target size | Edit links and E7 have at least a 44 px tap height. |

## Designer picks (not Diadem's words)

1. Saving or adding an Ending position does **not** regenerate the end image; images change only through Regenerate, as with Starting position (`a46e01d7`).
2. Ending position is editable in Edit my copy, like Starting position (`a46e01d7`).
3. E4 is the only helper, shown only in editable states. r1's separate field helper and the shared line "Only the parts that move change between the start and the end." were merged into E4.
4. In library details, E7 opens Edit for everyone (a new version for everyone) rather than editing inline.
5. Patients get no Positions heading, helper or thumbnails, because the carousel and print columns already show the stills.
6. The description sits right after the title and before the carousel, so the patient reads it first (approved on the 1:42 PM revision).

## Is/was

| Topic | Is | Was |
| -- | -- | -- |
| Ending position text | New field right after Starting position in the template, on every practitioner surface | No such field |
| Layout (draft review, library details, edit form) | One **Positions** card: Starting then Ending position, each with a still thumbnail (`a46e01d7`) | CTO pick: an Ending position section of its own (`5a6fd98b`); today Starting position is a section of its own in draft review |
| Library details | Positions card before How to do it | Neither position text showed; only How to do it |
| Older version with no ending | E6, with E7 for editors; never the last-step fallback | n/a |
| Patient link page row (phone) | Title, description, carousel, positions, dose, note | Title, carousel, dose, notes (DIDI-1192, G update 3: "media right after the title") |
| Print column 1 | Title, description, positions, dose, note | Title, dose, note |
| Patient, no ending or no description | That item is left out | n/a |
| End image on save | Not regenerated | n/a |

The description before the carousel departs from DIDI-1192's "the media comes right after the title" on the phone link page. Diadem approved it on revision `475494418896523264` (1:42 PM EST, `4506b55d`).

## States (mockups)

| # | State | Phone (390 px) | Desktop (1280 px) |
| -- | -- | -- | -- |
| 00 | Baseline: draft review on main, Starting position only | [phone](mockups/00-baseline-draft-review-phone.png) | n/a |
| 01 | Draft review, ready, editable | [phone](mockups/01-draft-review-phone.png) | [desktop](mockups/01-draft-review-desktop.png) |
| 02 | Editing Ending position | [phone](mockups/02-draft-review-editing-ending-phone.png) | n/a |
| 03 | Generating (text in, images generating) | [phone](mockups/03-generating-phone.png) | n/a |
| 04 | Old draft, no ending position (E6, E7) | [phone](mockups/04-old-draft-empty-phone.png) | n/a |
| 05 | Old draft, adding (empty editor, E5) | [phone](mockups/05-old-draft-adding-phone.png) | n/a |
| 06 | Edit for everyone, Positions fieldset | [phone](mockups/06-edit-for-everyone-phone.png) | [desktop](mockups/06-edit-for-everyone-desktop.png) |
| 07 | Edit for everyone, Ending position added (Changed, Save as version N) | [phone](mockups/07-edit-for-everyone-changed-phone.png) | n/a |
| 08 | Library details | [phone](mockups/08-library-details-phone.png) | [desktop](mockups/08-library-details-desktop.png) |
| 09 | Library details, older version with no ending position | [phone](mockups/09-library-older-version-phone.png) | n/a |
| 10 | Version history, Ending position as a changed field | [phone](mockups/10-version-history-phone.png) | n/a |
| 11 | Patient link page | [phone](mockups/11-patient-link-phone.png) | [desktop](mockups/11-patient-link-desktop.png) |
| 12 | Patient link page, row 2 with no ending position and no description | [phone](mockups/12-patient-link-no-ending-no-description-phone.png) | [desktop](mockups/12-patient-link-no-ending-no-description-desktop.png) |
| 13 | Print and PDF | [phone](mockups/13-print-pdf-phone.png) | [desktop](mockups/13-print-pdf-desktop.png) |
| 14 | Print and PDF, row 2 with no ending position and no description | [phone](mockups/14-print-pdf-no-ending-no-description-phone.png) | [desktop](mockups/14-print-pdf-no-ending-no-description-desktop.png) |

Phone captures show the preview frame scaled to the column; build follows the MagicPath frame and this spec. Print is a document, so its phone capture only shows the preview at that width.

## Decisions

1. Design **D** only ("B and C combined", `a46e01d7`). A, B and C are exploration only.
2. Patients see both position texts (`a46e01d7`) and the description (`9a307ad9`, `4506b55d`), all from the pinned version; empty ones are left out.
3. The last-step fallback is used only for the image prompt and is never shown anywhere (`5a6fd98b`).
4. Helper and placeholder describe only the moving body parts (`ac1c42dd`).
5. Mobile first at **390 px**; **1280 px** keeps the existing review grid, library and link page layouts.
6. No gallery components in the Physio POC (spec and mockups only).

## Build notes

- Build ticket: [DIDI-1283](https://linear.app/didi-build/issue/DIDI-1283) (widened on comment `a7dc5945` to include the patient link page, print and the description).
- Data: a new `ending_position` text field in the template right after `starting_position`, versioned like the other text fields, overridable in My copy, and included in the pinned version the link page reads.
- Draft review: today only Basics and Starting position render (`src/ui/exercise-requests/DraftReviewPage.tsx:673-708`). Replace the Starting position `h3` plus `DraftTextField` with the Positions card holding both fields.
- Library details: today only How to do it renders (`src/ui/exercise-library/ExerciseDetailsPage.tsx:208`). Add the read-only card before it.
- Link page and print: add the description and the positions `dl` to each row in the text column, and to column 1 in print.

## Changes

- **Nov 23, 2026**: DIDI-1282. New feature: Ending position text in one Positions card with still thumbnails (design D, Diadem Nov 22, 3:31 PM EST "B and C combined"); strings E1 to E7 and draft review approved Nov 23, 1:00 AM EST; patient link page and print, with both position texts and the exercise description, approved Nov 23, 1:42 PM EST. Unblocks [DIDI-1283](https://linear.app/didi-build/issue/DIDI-1283). https://linear.app/didi-build/issue/DIDI-1282
