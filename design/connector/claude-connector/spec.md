# Claude connector (AI assistant connector)

Area: connector · Feature: claude-connector

## Purpose

One remote MCP server that lets a practitioner build and manage programs from their own AI assistant (ChatGPT and Copilot first, also Grok and Claude). Every tool returns a plain text summary plus a share link that works in every assistant; an inline program card (MCP Apps) is an optional enhancement. The concept shows it in a Claude-style chat.

**Matches Product direction: yes.** Checked against the live DIDI-594 description and its locked Product direction comments (read Oct 25, 2026, after the 7:22 PM ET approval).

## Design source (approved Oct 25, 2026, 7:22 PM ET)

| Component | MagicPath link | Component id | Final revision |
| -- | -- | -- | -- |
| AI assistant connector, concept | https://designs.magicpath.ai/v1/steadily-brook-7993 | 464510461979815936 | 465211305146613760 |

Diadem approved this revision on Oct 25, 2026, 7:22 PM ET ("v12 is approved"), including the 7 design guesses listed in the routines and programs specs.

The connector did not change in v12. Its final revision is the v11 one above.

## States (scenario tabs in the concept)

| Scenario | What happens |
| -- | -- |
| Build | Searches exercises, creates the program, sets parameters, "Draft saved automatically", then a confirm card "Publish {name}?" ("Expires in 1 year, your default"). Publish creates the link; Not yet keeps the draft |
| From a routine | Searches routines, creates a program from one (a separate copy with its own name and code), sets parameters, confirm to publish |
| Find by code | Finds a program by its code (e.g. PRG-2M8D) and summarises it, including the routine it came from; changes affect only that patient's copy |
| Edit and publish | Edits save automatically; publishing (with confirm) updates the live link |
| Set expiry | Changes one program's link expiry with a confirm |
| Delete | Delete with an explicit confirm; closes the link; restorable for 30 days |
| Not found | Says the exercise isn't in the library and links to the web app search, prefilled, to request it |
| Reply level | Text reply (every assistant) or inline card (assistants that support MCP Apps), with a program preview |

## What the connector can and can't do

- Can: search approved exercises; search routines and create a program from one; build a program, or find one by its name or code; add, remove, reorder exercises and set parameters; set expiry; publish (with confirm); delete (with confirm); get the share link or PDF.
- Can't: create or edit exercises (web app request and review); create or edit routines (web app).

## Decisions

1. All four assistants should work; ChatGPT and Copilot are the MVP priority.
2. The connector creates and edits programs and share links (the old "read-only" wording was a misalignment). It can't create or edit exercises or routines.
3. Save and publish are separate; edits save automatically; publish and delete need an explicit user confirm. Delete with confirm, like the web app.
4. Default expiry 1 year, shown on the publish confirm.
5. Programs are found by name or code; no patient details.
6. Routines: search and create a program from one only.

## Mockups

Rendered from the approved connector source (revision 465211305146613760, unchanged since v11).

| State | Phone (390 px) | Desktop (1280 px) |
| -- | -- | -- |
| 01 build autosaved publish confirm | [phone](mockups/01-build-autosaved-publish-confirm-phone.png) | [desktop](mockups/01-build-autosaved-publish-confirm-desktop.png) |
| 02 build published 1 year | [phone](mockups/02-build-published-1-year-phone.png) | [desktop](mockups/02-build-published-1-year-desktop.png) |
| 03 build not yet kept draft | [phone](mockups/03-build-not-yet-kept-draft-phone.png) | [desktop](mockups/03-build-not-yet-kept-draft-desktop.png) |
| 04 build inline card | [phone](mockups/04-build-inline-card-phone.png) | [desktop](mockups/04-build-inline-card-desktop.png) |
| 05 program preview open | [phone](mockups/05-program-preview-open-phone.png) | [desktop](mockups/05-program-preview-open-desktop.png) |
| 06 routine search create program | [phone](mockups/06-routine-search-create-program-phone.png) | [desktop](mockups/06-routine-search-create-program-desktop.png) |
| 07 routine program published | [phone](mockups/07-routine-program-published-phone.png) | [desktop](mockups/07-routine-program-published-desktop.png) |
| 08 routine program not yet | [phone](mockups/08-routine-program-not-yet-phone.png) | [desktop](mockups/08-routine-program-not-yet-desktop.png) |
| 09 find by code | [phone](mockups/09-find-by-code-phone.png) | [desktop](mockups/09-find-by-code-desktop.png) |
| 10 edit autosaved publish confirm | [phone](mockups/10-edit-autosaved-publish-confirm-phone.png) | [desktop](mockups/10-edit-autosaved-publish-confirm-desktop.png) |
| 11 edit not yet kept draft | [phone](mockups/11-edit-not-yet-kept-draft-phone.png) | [desktop](mockups/11-edit-not-yet-kept-draft-desktop.png) |
| 12 set expiry | [phone](mockups/12-set-expiry-phone.png) | [desktop](mockups/12-set-expiry-desktop.png) |
| 13 set expiry confirmed | [phone](mockups/13-set-expiry-confirmed-phone.png) | [desktop](mockups/13-set-expiry-confirmed-desktop.png) |
| 14 delete confirm | [phone](mockups/14-delete-confirm-phone.png) | [desktop](mockups/14-delete-confirm-desktop.png) |
| 15 deleted | [phone](mockups/15-deleted-phone.png) | [desktop](mockups/15-deleted-desktop.png) |
| 16 not found link to request | [phone](mockups/16-not-found-link-to-request-phone.png) | [desktop](mockups/16-not-found-link-to-request-desktop.png) |

## Locked Product direction (verbatim from DIDI-594)

**DIDI-594 description, section "**Assistants (CTO decision, Oct 23, 2026):**"** (https://linear.app/didi-build/issue/DIDI-594):

> **Assistants (CTO decision, Oct 23, 2026):** one remote MCP server, using Streamable HTTP on a public HTTPS URL, serves Claude, ChatGPT, Grok and Copilot. Kojo uses ChatGPT and Claude, and Diadem uses Grok. Every tool returns a plain text summary plus a share link, which works in every assistant. An inline program card using the MCP Apps standard (renders in Claude, ChatGPT and M365 Copilot; unconfirmed in Grok) is an optional enhancement on top, never the only output. Check ChatGPT plan limits for custom connectors that write (developer mode; full support is in beta for Business and Enterprise) before testing with Kojo.

**DIDI-594 comment, 2026-10-24 17:06 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Locked Product direction (addition)
>
> **Diadem, Oct 24, 2026, 1:06 PM ET (CTO chat), verbatim:**
> > all 4 connectors should work, but for the mvp we are prioritizing chatgpt and copilot.
>
> Meaning: the MCP connector must work in ChatGPT, Copilot, Grok and Claude. MVP priority (build, test and polish first) is ChatGPT and Copilot.
>
> Is/was: was "MCP connector (ChatGPT, Grok)"; is "all four, ChatGPT and Copilot prioritized for the MVP".
>
> Still open on DIDI-821: Q2, the scope table check. Recorded by CTO.

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

**DIDI-594 comment, 2026-10-24 17:43 UTC** (https://linear.app/didi-build/issue/DIDI-594):

> ## Trace: connector 'read-only' misalignment
>
> - **Source:** the Oct 23, 2026, 6:29 PM ET comment on this ticket, "Decision (Diadem, ... while with Kojo)", written by a bot as a paraphrase with no verbatim quote. It says "In v1 the MCP connector is read-only and links to the web app's search when something isn't found." The most likely intended meaning was that the connector can't create or edit *exercises* (new exercises go through the web app request and approval), but it was written as the whole connector being read-only.
> - **Design was right:** Designer's DIDI-809 concept (Diadem's screenshot, Oct 24) shows the connector searching, creating a program and making its share link and PDF.
> - **Why it lasted:** it's the same failure as the we-met relay drift: a paraphrased 'Diadem said' with no verbatim words, and nothing checked later tickets against it. Rules 1 to 4 (locked verbatim block) now cover this; the 1:39 PM verbatim answer above supersedes the Oct 23 wording.
>
> Locked: the connector creates and edits programs and share links, searches exercises, and can't create or edit exercises (a missing exercise links to the web app request). Recorded by CTO.

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

Every user-facing string in the connector concept, in source order. `{...}` marks a runtime value. Sample data (exercise and program names, dates) is example content.

### Connector concept

- Copenhagen plank, short lever
- Heel slides
- Straight leg raise
- Terminal knee extension
- Sit to stand
- Calf stretch
- Build a week 1 knee rehab program: heel slides, straight leg raises, terminal knee extensions with a light band, and wall sits. 3 sets each. Call it
- Build a week 1 knee rehab program: heel slides, straight leg raises, terminal knee extensions with a light band, and wall sits. 3 sets each. Call it "Knee rehab, week 1" and give me a link I can send.
- Knee rehab, week 1
- Searched exercise library
- Draft saved automatically
- Knee rehab, week 1, 4 exercises
- Published program
- You confirmed
- Created share link
- Expires in 1 year, your default
- Find a routine for knee arthritis and make a program from it called
- Find a routine for knee arthritis and make a program from it called "Knee OA, week 1". Make the sit to stands 10 reps.
- Knee OA, week 1
- Searched routines
- Created program from routine
- Knee osteoarthritis, starter, v3. Separate copy, PRG-6T2P
- Set parameters
- Sit to stand, 2 x 10
- Not live yet
- What's in PRG-2M8D? Is the link live?
- Found program by code
- PRG-2M8D, Hip strength, phase 2, 4 exercises
- In Knee rehab, week 1: add clamshells after heel slides, remove the straight leg raises, move wall sits to the top and make them 45s holds.
- Read program
- Added exercise
- Clamshell, 3 x 10, after Heel slides
- Removed exercise
- Reordered
- Wall sit moved to the top
- Wall sit, 3 x 45s hold
- You confirmed. Same link
- Make the Knee rehab, week 1 link expire on Dec 15.
- Updated share link
- Expires Dec 15, 2026
- Delete Hip strength, phase 2. I don
- Delete Hip strength, phase 2. I don't use it anymore.
- PRG-2M8D, 4 exercises, link open
- Deleted program
- You confirmed. Moved to Recently deleted
- Closed share link
- Add {MISSING}, 3 x 20s hold each side, to Knee rehab, week 1.
- No approved match
- Glute bridge
- Hamstring stretch
- Concept
- Using the physio connector inside an AI assistant
- A generic assistant, not any real product. The connector works in ChatGPT, Microsoft Copilot, Grok and Claude. ChatGPT and Copilot come first for the MVP.
- Scenario
- From a routine
- Find by code
- Edit and publish
- Reply level
- Text reply (every assistant)
- Inline card (MCP Apps)
- Text reply, works in every assistant
- Your AI assistant
- Assistant is working
- Message
- Message your assistant
- What the connector can do (v1)
- Search approved exercises
- Build a program, or find one by its name or code
- Search routines and create a program from one. It is a separate copy with its own name and code
- Add, remove and reorder exercises and set parameters. Changes save as a draft automatically
- Publish to the live link, only after you confirm
- Set link expiry: any date from tomorrow, or never
- Delete a program, only after you confirm. It closes the link and can be restored for 30 days
- Point to the PDF, which anyone can save from the link
- Create or edit exercises. A missing exercise links to the web app, where any practitioner can request it.
- Create or edit routines. That happens in the web app.
- Routines
- Ready-made programs for common conditions, shared by every practitioner. A program made from a routine is a separate copy with its own name and code, so later routine edits never change what a patient already has.
- Drafts save automatically
- Every edit saves as a draft right away. There is no save step. Your patient sees changes only after you publish, on the same link. Publish and Delete always show a card you have to confirm. It works the same in the web app.
- Where it works
- Microsoft Copilot
- MVP first
- Supported
- All four must work. ChatGPT and Copilot are built, tested and polished first.
- Two reply levels
- Text reply:
- every assistant shows this. Program summary, link and PDF. Confirm cards fall back to a typed yes or no.
- Inline card:
- an interactive card for assistants that support the MCP Apps standard. Others fall back to the text reply.
- No patient details
- Programs have a name you pick, like "Knee OA, week 1", and a code. Nothing that identifies a patient is sent to the assistant or stored.
- Published.
- is live:
- Share link:
- The link expires in 1 year, on Oct 23, 2027, your default. I can change that to any date from tomorrow, or never.
- PDF:
- anyone with the link can save the program as a PDF from the link page.
- Want me to change sets, reps or notes? Changes save as a draft right away, and I'll ask before publishing.
- Published. Here's
- PRG-7K3Q
- 4 exercises · Published · Link expires in 1 year (Oct 23, 2027)
- Open link
- Opening the share link
- Save as PDF
- Saving Knee rehab, week 1.pdf from the link page
- Inline card works in assistants that support MCP Apps, such as Claude, ChatGPT and Microsoft 365 Copilot. Others, including Grok for now, show the text reply.
- I found 2 routines for knee arthritis:
- Knee osteoarthritis, starter
- , v3, 5 exercises, used 31 times
- (I used this one)
- Knee replacement, weeks 2 to 6
- , v2, after surgery
- I made a separate copy called
- (code
- PRG-6T2P
- Later edits to the routine won't change this program. It isn't live yet. To get a link to send, please confirm below.
- Published
- It expires in 1 year, on Oct 23, 2027, your default.
- To change just this patient's copy later, ask me for PRG-6T2P or Knee OA, week 1, or find it in Programs in the web app.
- Okay, nothing is published.
- (PRG-6T2P) stays as a draft in your Programs, already saved. Ask me to publish it when you're ready.
- I built
- from your approved exercises. It saved automatically as a draft:
- It isn't live yet. To get a link to send, it needs to be published. Please confirm below.
- stays as a draft in your Programs, already saved. Ask me to publish it when you're ready.
- Hip strength, phase 2
- (PRG-2M8D) has 4 exercises. It was made from the routine
- Hip osteoarthritis, mobility and strength
- (v2), then tweaked:
- Live:
- yes. Published Oct 23, 2026. The link never expires.
- Draft changes:
- none. Your patient sees exactly this.
- Changes to this program affect only this patient's copy. The routine stays the same.
- Saved automatically as a draft for
- Wall sit
- , 3 x 45s hold
- (moved to the top, was 30s)
- Clamshell
- (added)
- , 3 x 15, light band
- Removed: Straight leg raise.
- This isn't live yet. Your patient still sees the version published Oct 24, 2:10 PM on
- Published. Your patient now sees the new
- on the same link:
- No need to send a new link.
- Okay, I didn't publish. The changes are already saved as a draft, and the link still shows the version from Oct 24, 2:10 PM. You can publish here or in the web app.
- Done. The share link for
- now expires on
- Dec 15, 2026
- I can set any date from tomorrow, with no latest date, or make it never expire.
- (PRG-2M8D) has 4 exercises and an open share link. Deleting it closes that link. Please confirm below.
- Deleted
- and closed its share link. Anyone who opens it sees "This link was closed".
- This link was closed
- You can restore it from Recently deleted in the web app until
- Nov 23, 2026
- . The old link stays closed after a restore.
- Okay, I kept
- . Nothing changed, and its link still works.
- Publish Knee rehab, week 1?
- Creates the share link. Anyone with it sees this version.
- Expires in 1 year (Oct 23, 2027), your default.
- Publish Knee OA, week 1?
- A separate copy of Knee osteoarthritis, starter, v3. Later routine edits won\
- Code PRG-6T2P. Creates the share link.
- Publish changes to Knee rehab, week 1?
- Wall sit to the top, 3 x 45s hold
- Added Clamshell, 3 x 10
- Removed Straight leg raise
- Your patient sees this on the same link right away.
- Delete Hip strength, phase 2?
- PRG-2M8D, 4 exercises. It moves to Recently deleted.
- Closes its share link, so anyone who opens it sees "This link was closed".
- You can restore it in the web app for 30 days.
- Delete program
- You confirmed: {c.yes}
- You chose: {c.no}
- isn't in your exercise library yet, and I can't create new exercises from here.
- You can request it in the web app. The search is already filled in:
- Once a practitioner approves it, ask me again and I'll add it to Knee rehab, week 1. The rest of the program is unchanged.
- Web app preview
- Close
- Close preview
- Didi Physio, Library
- Signed in as Kojo
- The AI is drafting it now. Every practitioner can see it in Requests and drafts, and any of them can approve it.
- Note for the AI
- (optional)
- For example: rehab version, supine
- Request it


## Changes

- **Oct 23, 2026**: First concept: build in chat, text reply and inline card, not found. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: Connector creates programs and links; all four assistants; read, edit, set expiry, publish and delete with confirms; save vs publish. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-828, https://linear.app/didi-build/issue/DIDI-829
- **Oct 25, 2026**: v10: edits save automatically. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v11: From a routine, Find by code, 1 year default expiry. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-852
- **Oct 25, 2026**: v12 approved by Diadem (7:22 PM ET). No change to the connector in v12. https://linear.app/didi-build/issue/DIDI-809
