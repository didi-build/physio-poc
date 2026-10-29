# Share link expiry (My defaults)

Area: app · Feature: settings-link-expiry

## Purpose

Share links expire after a default the practitioner controls. The global default is 1 year. Each practitioner can set their own default on My defaults, and every program can override it, including Never or a specific date. My defaults also holds the practitioner's default doses per exercise type.

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
| My defaults | Reached from the account menu ("My defaults, Types, links") and from "Change it in My defaults" on the Publish and share sheets. "Share link expiry" with "Your default" and the expiry choices; "Global default: 1 year."; a badge when your default differs from the global one. Below: "Exercise types" defaults with "Reset to global" |
| Changed default | e.g. 1 week selected; "New links will expire after 1 week" |
| Program expiry | On the Publish sheet and the share sheet, "Link expires · This program only": 1 week, 30 days, 90 days, 1 year (default marked), Never, Pick a date |
| Never | "Never expires." "Good for a general program you reuse. It works until you close it." |
| Pick a date | "Link stops working on" date field. "Any date from tomorrow. There is no latest date." |
| Connector | The connector shows "Expires in 1 year, your default" and can change one program's expiry |

## Key copy

- "Your defaults fill in new program rows and new share links. Where you haven't set one, the global default is used."
- "New share links use this. You can change it on each program."
- "Never means a link works until you close it."
- "Global default: 1 year."
- "Expiry changes apply to the link right away." / "Applies to the new link."

## Decisions

1. Default share-link expiry is **1 year** for every practitioner (changed Oct 25, 2026 from 90 days).
2. Practitioners can change their own default and set expiry per program, including Never.
3. Choices: 1 week, 30 days, 90 days, 1 year (default), Never, and a custom date: any date from tomorrow, no maximum.
4. Changing the default only affects new links; existing links keep their expiry.
5. Reusing a general program: one link per program; set it to Never.

## Mockups

Rendered from the approved revision 465225161508020224. The 1 year default also shows on the Publish sheet and share sheet mockups in the programs spec.

| State | Phone (390 px) | Desktop (1280 px) |
| -- | -- | -- |
| 01 my defaults expiry 1 year | [phone](mockups/01-my-defaults-expiry-1-year-phone.png) | [desktop](mockups/01-my-defaults-expiry-1-year-desktop.png) |
| 02 my defaults expiry changed | [phone](mockups/02-my-defaults-expiry-changed-phone.png) | [desktop](mockups/02-my-defaults-expiry-changed-desktop.png) |
| 03 program expiry never | [phone](mockups/03-program-expiry-never-phone.png) | [desktop](mockups/03-program-expiry-never-desktop.png) |
| 04 program expiry custom date | [phone](mockups/04-program-expiry-custom-date-phone.png) | [desktop](mockups/04-program-expiry-custom-date-desktop.png) |

## Locked Product direction (verbatim from DIDI-594)

**DIDI-594 description, section "Share-link default expiry"** (https://linear.app/didi-build/issue/DIDI-594):

> ### Share-link default expiry (LOCKED, Oct 25, 2026, 4:21 PM ET, <issue id="c1610472-e692-4bcc-8856-2ddf6fe0d6b4" href="https://linear.app/didi-build/issue/DIDI-851/physio-confirm-share-link-default-expiry-is-now-1-year-replaces-90">DIDI-851</issue>)
>
> **Diadem, Oct 25, 2026, 4:15 PM ET (Designer chat, about** <issue id="0c98d085-6f43-4edd-b5d2-1f19587fd0dc" href="https://linear.app/didi-build/issue/DIDI-809/physio-mvp-concept-design-web-app-and-mcp-connector-flows-to-show-kojo">DIDI-809</issue>, relayed verbatim by Designer under rule 4):
>
> > "I'm with Coach right now, and we're going through the prototype together. one small change is he said that the defaults for every practitioner for the link expiry should be one year. and there's another, and there's gonna be more, but just that now."
>
> * **Is:** default share-link expiry is 1 year for every practitioner (Coach's request).
> * **Was:** "90-day expiry, but it should be a configurable value. Some practitioners would like it to be one week, or some would want it to be per patient. So 90-day defaults, but could have practitioner de-set defaults, as well as a per patient, or like, not per patient, but per program setting." (Diadem, Oct 24, 2026, 1:38 PM ET, CTO chat; locked comment on this ticket). Expiry choices: 1 week, 30 days, 90 days (default), 1 year, Never, plus a custom date (<issue id="60c9b7e8-7f55-4313-bf7d-86bd25df0c9e" href="https://linear.app/didi-build/issue/DIDI-827/physio-poc-concept-didi-809-8-picks-the-locked-direction-doesnt-answer">DIDI-827</issue> Q7, Oct 24, 2026).
> * **Status:** LOCKED (Done: <issue id="c1610472-e692-4bcc-8856-2ddf6fe0d6b4" href="https://linear.app/didi-build/issue/DIDI-851/physio-confirm-share-link-default-expiry-is-now-1-year-replaces-90">DIDI-851</issue>).
>
> **Designer's question, Oct 25, 2026, 4:21 PM ET (Designer chat), verbatim:** "Quick check so I lock it right: should one year replace 90 days as the default link expiry for every practitioner, with practitioners still able to change their own default and set expiry per program, including never?"
>
> **Diadem, Oct 25, 2026, 4:21 PM ET (Designer chat, relayed verbatim by Designer under rule 4):**
>
> > "Yes"
>
> **Final:**
>
> * **Is:** default share-link expiry is 1 year for every practitioner; practitioners can still change their own default and set per-program expiry, including never; choices stay 1 week, 30 days, 90 days, 1 year (now default), Never, custom date.
> * **Was:** 90-day default (Oct 24, 2026, 1:38 PM ET).

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

**DIDI-594 comment, 2026-10-25 20:22 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (change: share-link default expiry, LOCKED)
>
> **Diadem, Oct 25, 2026, 4:21 PM ET (Designer chat, relayed verbatim by Designer under rule 4)**, to "Quick check so I lock it right: should one year replace 90 days as the default link expiry for every practitioner, with practitioners still able to change their own default and set expiry per program, including never?": "Yes"
>
> | Topic | Is | Was |
> |---|---|---|
> | Default share-link expiry | 1 year for every practitioner; practitioners can still change their own default and set per-program expiry, including never; choices stay 1 week, 30 days, 90 days, 1 year (now default), Never, custom date | 90-day default (Oct 24, 2026, 1:38 PM ET) |
>
> DIDI-851 Done. The description's Share links line and Changes section are updated. Recorded by CTO.

## Copy inventory (verbatim from the approved source)

Every user-facing string in the parts of the approved source that render this feature, in source order. `{...}` marks a value filled in at runtime (a name, a count, a version, a date). Sample data (exercise names, program names, dates) is example content, not copy.

### Screens and sheets

- Programs
- My defaults
- Your defaults fill in new program rows and new share links. Where you haven't set one, the global default is used. Edits on a single exercise in My exercises win over both.
- Share link expiry
- Your default
- New share links use this. You can change it on each program.
- New links will never expire
- Default share link expiry
- Never means a link works until you close it.
- Global default: 1 year.
- Exercise types
- Changing your defaults only affects exercises you add from now on. Existing programs and share links stay the same.
- Global default, in use
- Edit your {t} default
- Set your own {t} default
- Reset to global
- Reads as:
- Save
- Saved your {t} default
- Cancel
- Global defaults are set for all practitioners. Up, down and rest can be added with "Add parameter".
- Add parameter
- default


## Changes

- **Oct 24, 2026**: My defaults with share link expiry (90 days default), per-program expiry with Never. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: Custom date: any date from tomorrow, no maximum. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-827, https://linear.app/didi-build/issue/DIDI-828
- **Oct 25, 2026**: Default changed to 1 year on both surfaces. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-851
- **Oct 25, 2026**: v12 approved by Diadem (7:22 PM ET). No change in v12. https://linear.app/didi-build/issue/DIDI-809
