# Claude connector (AI assistant connector)

Area: connector · Feature: claude-connector

## Purpose

One remote MCP server that lets a practitioner build and manage programs from their own AI assistant (Muse, Claude, ChatGPT, Grok and Copilot). Every tool returns a plain text summary plus a share link that works in every assistant; an inline program card (MCP Apps) is an optional enhancement. The concept shows it in a Claude-style chat.

**Matches Product direction: yes.** Checked against DIDI-594 comment bf5c77d7, DIDI-594 comment 1d16df1a and DIDI-594 comment ca41ca4d (Diadem, Nov 17, 2026).

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
| Set expiry | Changes one program's link expiry; confirm skipped when the user gave the date or expiry in the same message |
| Delete | Delete with an explicit confirm; closes the link; restorable for 30 days |
| Not found | Says the exercise isn't in the library and links to the web app search, prefilled, to request it |
| Reply level | Text reply (every assistant) or inline card (assistants that support MCP Apps), with a program preview |

## What the connector can and can't do

- Can: search approved exercises; search routines and create a program from one; build a program, or find one by its name or code; add, remove, reorder exercises and set parameters; set expiry; publish (with confirm); delete (with confirm); get the share link or PDF.
- Can't: create or edit exercises (web app request and review); create or edit routines (web app).

## Decisions

1. All five assistants should work (Muse, Claude, ChatGPT, Grok and Copilot). Every assistant gets the write tools in v1 (DIDI-594 ca41ca4d). Claude and Muse come first for the MVP (DIDI-594 comment 85cf8fbe, Nov 17, 2026, 10:48 PM EST: "Claude and Muse come first for the MVP; remove the ChatGPT and Copilot line").
2. The connector creates and edits programs and share links (the old "read-only" wording was a misalignment). It can't create or edit exercises or routines.
3. Save and publish are separate; edits save automatically. Publish, delete and set expiry (when the user did not already give the date or expiry in the same message) need an explicit user confirm in the conversation. The server does not check. Confirm lines are reference wording; the assistant may reword them if it covers the same facts.
4. Default expiry 1 year, shown on the publish confirm.
5. Programs are found by name or code; no patient details.
6. Routines: search and create a program from one only.

## Approvals (Diadem, verbatim)

DIDI-594 comment bf5c77d7, Diadem, Nov 17, 2026 (CTO chat, times EST):
- 8:14 PM: "oh perfect. that means we can go ahead with the write connector plan. can you ensure tickets are in place? I think we already designed it but it could have been lost."
- 8:22 PM (widget picks): "Muse gets write tools"; "Claude gets write tools"; "Build the full October set: create, edit, from routine, publish, set expiry, delete"; "The assistant asking for confirmation is enough"

**CTO, same chat (bf5c77d7), without Diadem objection:** creating or editing exercises and routines stays out, and ChatGPT stays read-only (ChatGPT and Grok were not picked).

The **Is** lines from the same lock are in the Locked Product direction block under comment bf5c77d7 (assistant scope superseded for v1 by ca41ca4d).

DIDI-594 comment 1d16df1a, Diadem, Nov 17, 2026, 8:35 PM EST (Designer chat widget, answering "DIDI-1241 connector wording"):

| Question | Diadem's answer, verbatim | Applied in |
| -- | -- | -- |
| The 24 proposed strings | "approve however don't hardcode "Kojo"." | #1 to #24 approved; #13 and #20 removed per ca41ca4d; no string or tool description names Kojo |
| Should Muse and Claude use the confirm lines word for word? | "Confirm lines can be reworded if they cover the same facts" | Confirm wording, tool description rule |
| If the expiry date was already given, should it still ask before changing it? | "Skip confirm when he already gave the date" | Set expiry (section below) |
| Which patient-details warning? | "Use the shorter patient-details line (#18)" | Error codes; the old line on main is retired |
| Should Muse be named anywhere besides the consent page? | "Muse named only on the consent page" | Consent page; Muse is not added to the concept's "Where it works" or any other user-facing string |

DIDI-1251, Diadem, Nov 18, 2026, 2:03 PM EST (Designer chat widget; proposed strings in comment b8c35761): "Approve #25 to #27 as written, and reuse "Do not pass patient information." on the free-text fields". Applied in Tools (v13), write-tool descriptions and Free-text write fields.

## Is/was against the Oct 29 read-only lock

| Topic | Is (v13) | Was (Oct 29, 2026 lock, DIDI-594 comment 6b866ab0: 7:16 PM ET "ok v1 connector can be read only , and any "write" use cases will send a link that opens the exact page that he needs to do the action on"; 7:26 PM ET "for v1 we will do read only tools") |
| -- | -- | -- |
| Which assistants write | Every assistant gets the write tools (DIDI-594 ca41ca4d, Nov 17, 2026): 10:34 PM EST "I'm not building for Claude code right now. regular Claude (UI) and Muse are the v1 targets"; 10:34 PM EST, widget answer: "Custom Claude clients get writes too"; 10:36 PM EST "v1 make it a write connector. this tool is closed/not open to the public/only me and Kojo have access so I'm not worried about other people attempting to use the wrong platforms" | No assistant writes |
| Which assistants write (intermediate v13 draft) | (superseded by ca41ca4d) | Muse and Claude only; ChatGPT, Grok, Copilot read-only (bf5c77d7) |
| Write set | Create or edit a program (rows, parameters, rename), from a routine, publish (defaults or overrides), set one program's link expiry, delete | Every write was a deep link to the web app |
| Confirm | The assistant asks in the conversation before publish and delete, and before set expiry unless the user already gave the date or expiry in the same message. No server confirm step. The confirm lines are reference wording; the assistant may reword them if it covers the same facts | Not applicable |
| Set expiry confirm | Skipped when the user gave the date or expiry in the same message; asked otherwise | v12 (Oct 25): always "with a confirm" |
| Patient-details warning | #18 | An unapproved line on main ("Remove patient details (names, contact information, health card numbers, and dates of birth) from this text before sending it to the connector."), now retired |
| Exercises and routines | Can't create or edit (unchanged) | Same |
| Consent page | One write page (#21 to #24). The Oct 31 read-only consent page is retired in v1 | One read-only page |
| Removed with ca41ca4d | #13 and `write_not_allowed` removed; #20 and read-tool description append removed; read-only assistant behaviour removed; per-client gating and DIDI-1243 canceled; two-version consent table removed | In the intermediate v13 draft before ca41ca4d |
| MVP priority (DIDI-594 comment 85cf8fbe, Nov 17, 2026, 10:48 PM EST) | Claude and Muse come first for the MVP; concept copy "ChatGPT and Copilot come first for the MVP" removed. Verbatim: "Claude and Muse come first for the MVP; remove the ChatGPT and Copilot line". Concept copy "MVP first" and "All four must work. ChatGPT and Copilot are built, tested and polished first." removed (DIDI-594 comment 7a9f5122, Nov 17, 2026, 11:01 PM EST, verbatim: "Delete both lines with no replacement") | ChatGPT and Copilot remain MVP priority (Oct 24 lock); concept copy "ChatGPT and Copilot come first for the MVP" approved |
| v12 spec (Oct 25) | Restored as the source for Build, From a routine, Edit and publish, Set expiry, Delete. Confirm cards become questions the assistant asks (the inline card stays optional) | Superseded by the Oct 29 lock for writes |

Muse is not added to the concept's "Where it works" or any other user-facing string; the only place the user sees Muse named is the consent page, through the app's self-reported `{name}` (Diadem: "Muse named only on the consent page"). Naming Muse in spec prose and config is fine.

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

**DIDI-594 comment 6b866ab0** (https://linear.app/didi-build/issue/DIDI-594)

v13 reading: superseded for v1 write tools by bf5c77d7 and ca41ca4d.

> **Product direction update: the V1 connector is read-only** (Diadem, verbatim)
>
> - Oct 29, 2026, 7:16 PM ET: "ok v1 connector can be read only , and any "write" use cases will send a link that opens the exact page that he needs to do the action on"
> - Oct 29, 2026, 7:26 PM ET: "for v1 we will do read only tools"
>
> **Is:** every V1 MCP tool is read-only (readOnlyHint: true, destructiveHint: false, openWorldHint: false). Any write use case returns a deep link to the exact app page where Kojo takes the action himself.
> **Was:** the connector could publish an exercise once Kojo said yes in chat (DIDI-993).
>
> The Microsoft Copilot connector is parked in Icebox as DIDI-1041. ChatGPT comes first.
>
> The Google sign-in change (7:02 PM ET) and Better Auth will be recorded here when Diadem okays those Linear updates.

**DIDI-594 comment bf5c77d7** (https://linear.app/didi-build/issue/DIDI-594)

> ## Product direction update (CTO, Nov 17, 2026): connector write tools return for Muse and Claude (LOCKED)
>
> **Diadem, Nov 17, 2026 (CTO chat, verbatim, times EST):**
>
> * 8:10 PM: "for the physio poc.. we decided that the connector was read only due to chatgpts limitations. I have a question, does Muse allow us to add custom connectors? and can they be write as well?"
> * 8:14 PM: "oh perfect. that means we can go ahead with the write connector plan. can you ensure tickets are in place? I think we already designed it but it could have been lost."
> * 8:22 PM (scope picks, CTO chat widget):
>   * Which assistants get the write tools? "Muse gets write tools"; "Claude gets write tools"
>   * What's in the first round? "Build the full October set: create, edit, from routine, publish, set expiry, delete"
>   * How should the okay for publish, expiry and delete work? "The assistant asking for confirmation is enough"
>
> CTO stated in the same chat, without objection: creating or editing exercises and routines stays out, and ChatGPT stays read-only (ChatGPT and Grok were not picked).
>
> **Is:**
>
> * The connector gets write tools again, for **Muse and Claude only**. ChatGPT, Grok and Microsoft Copilot (DIDI-1041, Icebox) stay read-only and keep the deep links to the exact web app page.
> * The full Oct 24 to 29 write set is live again:
>   * DIDI-828 Q6 (Oct 24, 2026, 6:56 PM ET): "build a program, read a program, add/remove/reorder/delete exercises to a program (set parameters), set expiry, publish live. … when editing a program, there is saving and publishing (aka a publishing it will change the live sent link). publishing a program and deleting a program requires a confirmation step the user needs to explicitly okay"
>   * DIDI-829 (Oct 24, 2026, 7:00 and 7:01 PM ET): "1A: yes, save and publish on both the web app and connector"; "2C: delete-with-confirm everywhere" (replaces Q6's empty-only delete)
>   * DIDI-993 (Oct 29, 2026, 3:07 PM ET): "the assistent should tell kojo there is a draft version (and if there is an existing published version) to check which once he wants the link for. if he wants the draft, it will ask if he wants to publish with the default parameters (or ask him to specify overrides)"
>   * Routines (comment be5607aa, Oct 25, 2026, 5:39 PM ET): "Yes, the connector only searches routines and creates programs from them" (a separate copy; no routine create or edit)
> * Write tools: create or edit a program (including from a routine), publish (defaults or overrides; republish keeps the same link), set one program's link expiry, and delete a program (closes its link; restorable for 30 days in the web app).
> * **Confirmation is assistant-side only.** Publish, set expiry and delete tool descriptions require the assistant to get Kojo's explicit confirmation in the conversation first, on top of the assistant's own approval prompt (for example Muse's per-write approval). No server confirm token.
> * Exercise and routine creation or editing stays out. The no-patient-information hard rule is unchanged.
> * Approved design source: `design/connector/claude-connector/spec.md` (v12, approved Oct 25, 2026, 7:22 PM ET). It gets a v2 for the write tools, and Diadem approves every new string verbatim.
>
> **Was:** the Oct 29, 2026 read-only lock: 7:16 PM ET "ok v1 connector can be read only , and any "write" use cases will send a link that opens the exact page that he needs to do the action on" and 7:26 PM ET "for v1 we will do read only tools" (DIDI-1045, physio-poc#18). That lock still applies to ChatGPT, Grok and Copilot.
>
> **Reconciliation (CTO):** Diadem's locks win over CTO's DIDI-989 answers 4 and 7 (Oct 29, 2026, 3:04 PM ET), which had kept delete and per-program expiry in the web app only. Set expiry and delete are now connector tools.
>
> **Correction:** comment 6b866ab0 (Oct 29) says "the connector could publish an exercise once Kojo said yes in chat". It should say **program**. The connector never published exercises.
>
> The locked text in the description above is not edited. This comment is the new lock. Tickets follow under DIDI-810.

**DIDI-594 comment 1d16df1a** (https://linear.app/didi-build/issue/DIDI-594)

> **Product direction lock: write connector strings (DIDI-1241, spec v13)**
>
> Diadem answered in Designer's chat on Nov 17, 2026 at 8:35 PM EST, using widget answers. Designer relayed them to CTO. Verbatim:
> - 24 proposed strings: "approve however don't hardcode "Kojo"."
> - "Confirm lines can be reworded if they cover the same facts"
> - "Skip confirm when he already gave the date"
> - "Read-only assistants can use their own words plus the link"
> - "Use the shorter patient-details line (#18)"
> - "Muse named only on the consent page"
>
> | Item | Is (locked) | Was |
> |---|---|---|
> | v13 strings | The 24 proposed strings are approved. No string hardcodes "Kojo". #20 reads: "This assistant can't make changes. For any change, give the user the matching link." | Not yet approved |
> | Confirm lines (publish, set expiry, delete) | The assistant may reword them as long as they cover the same facts | — |
> | Set expiry confirm | Skipped when the user already gave the date in the same message | Always confirm |
> | Read-only assistants (ChatGPT, Grok, Copilot) | May use their own words plus the matching link | — |
> | Patient-details line | The shorter version, #18 | — |
> | Muse naming | Named only on the consent page | — |
>
> This adds to lock bf5c77d7 and doesn't conflict with it. The spec of record will be Designer's v13 PR.

**DIDI-594 comment ca41ca4d** (https://linear.app/didi-build/issue/DIDI-594)

v13 reading: DIDI-1243 is canceled. Every assistant gets write tools in v1. Read-only tier, #13, #20 and the read-only consent page are removed from this spec.

> **Product direction lock: write tools for every assistant in v1 (supersedes part of bf5c77d7)**
>
> Diadem wrote in CTO chat on Nov 17, 2026. Verbatim:
> - 10:34 PM EST: "I'm not building for Claude code right now. regular Claude (UI) and Muse are the v1 targets"
> - 10:34 PM EST, widget answer: "Custom Claude clients get writes too"
> - 10:36 PM EST: "v1 make it a write connector. this tool is closed/not open to the public/only me and Kojo have access so I'm not worried about other people attempting to use the wrong platforms"
>
> | Item | Is (locked) | Was (bf5c77d7) |
> |---|---|---|
> | Who gets write tools | Every signed-in client of the connector | Muse and Claude only |
> | ChatGPT, Grok, Copilot | Same tools as everyone else, write included | Read-only |
> | Per-assistant gating (DIDI-1243) | None. DIDI-1243 is canceled | Allowlist on azp plus a programs:write scope |
> | Targets Diadem tests in v1 | Regular Claude (UI) and Muse | Muse and Claude |
> | Claude Code | Not a v1 target. No work is done for it | Read-only (CTO proposal, never locked) |
>
> The other parts of bf5c77d7 and 1d16df1a are unchanged. That covers the full October set (create, edit, from routine, publish, set expiry, delete), the confirmation step living in the assistant only, and the approved strings. Strings that only existed for read-only assistants (such as #20) drop out of the spec.
>
> This reversal stays safe only while access is closed. Only practitioner accounts, today Diadem and Kojo, can sign in, and every tool still checks that the token belongs to a practitioner. Before the connector opens to any other user, re-decide per-assistant gating.

## Confirm wording (assistant-side, before publish, set expiry and delete)

How it works: the tool descriptions for `publish_program`, `set_program_link_expiry` and `delete_program` tell the assistant to ask the user in the conversation and wait for a yes before calling the tool. The server does not check. Muse's own approval prompt can appear on top; we don't control its wording.

**Tool description rule (Diadem: "Confirm lines can be reworded if they cover the same facts"):** each write tool description gives the lines below as reference wording. The assistant may reword them as long as it covers the same facts:
- Publish: the program name, that it creates or updates the share link, that anyone with the link sees this version, the expiry (and whether it's the default), and for a routine copy that later routine edits won't change it. For republish, what changed and that the patient sees it on the same link.
- Set expiry: the program name, the new expiry, that it's the same link, and the current expiry.
- Delete: the program name, code and exercise count, that it moves to Recently deleted, that the share link closes (when open), and that it can be restored in the web app for 30 days.
Tool descriptions never name a specific practitioner; they say "the user".

Before asking, the assistant reads the program (`get_program_share_link_or_pdf`) so the question has the real name, code, exercise count, link state and expiry.

### Publish, first publish (defaults)

- REUSED: "Publish {name}?"
- REUSED: "Creates the share link. Anyone with it sees this version."
- REUSED (v12 sample "Expires in 1 year (Oct 23, 2027), your default."): "Expires in {expiry} ({date}), your default."
- APPROVED #1: "Reply yes to publish, or tell me a different expiry. No keeps it as a draft."

### Publish, from a routine

- REUSED: "Publish {name}?"
- REUSED, full text verified against the approved MagicPath source (component 464510461979815936, revision 465211305146613760; the v12 copy inventory had cut it at "won"): "A separate copy of {routine}, v{n}. Later routine edits won't change it."
- REUSED: "Code {code}. Creates the share link."
- REUSED: "Expires in {expiry} ({date}), your default."
- APPROVED #1, as above.

### Publish, republish changes (same link)

- REUSED: "Publish changes to {name}?"
- REUSED: one line per change from `publish_change_lines` (v12 samples: "Wall sit to the top, 3 x 45s hold", "Added Clamshell, 3 x 10", "Removed Straight leg raise")
- REUSED: "Your patient sees this on the same link right away."
- APPROVED #2: "Reply yes to publish, or no to keep the changes as a draft."

### Which version (DIDI-993: draft and published both exist, the user asks for "the link")

Diadem, Oct 29, 2026, 3:07 PM ET: "the assistent should tell kojo there is a draft version (and if there is an existing published version) to check which once he wants the link for. if he wants the draft, it will ask if he wants to publish with the default parameters (or ask him to specify overrides)"
- REUSED: "This isn't live yet." (already on main as the summary for this state)
- APPROVED #3: "{name} has draft changes that aren't live yet. Do you want the link to the published version, or should I publish the draft first?"
- If the user picks the draft: republish flow above.

### Overrides (the user wants a different expiry at publish)

- REUSED: "I can set any date from tomorrow, with no latest date, or make it never expire."
- Then first publish with the chosen expiry and APPROVED #4: "Expires in {expiry} ({date})." / "Never expires."

### Set expiry (one program)

Skip the confirm when the user gave the date or expiry in the same message (for example "make the Knee rehab, week 1 link expire on Dec 15"): the assistant calls the tool and replies with the after-yes lines below. Diadem: "Skip confirm when he already gave the date". Ask when they didn't (for example "change the expiry on Knee rehab, week 1" and the assistant proposes a date):
- APPROVED #5: "Change the link for {name} to expire on {date}?" / "Change the link for {name} to never expire?"
- APPROVED #6: "It's the same link. Right now it expires on {current_date}." / "It's the same link. Right now it never expires."
- APPROVED #7: "Reply yes to change it, or no to leave it."

The `set_program_link_expiry` tool description says the same: call directly when the user's message names the date or expiry; otherwise confirm first.

### Delete

- REUSED: "Delete {name}?"
- REUSED: "{code}, {n} exercises. It moves to Recently deleted."
- REUSED (only when the link is open): "Closes its share link, so anyone who opens it sees "This link was closed"."
- REUSED: "You can restore it in the web app for 30 days."
- APPROVED #8: "Reply yes to delete it, or no to keep it."

### After yes / after no

- After publish yes: REUSED v12 reply ("Published.", "Share link:", "The link expires in {expiry}, on {date}, your default. I can change that to any date from tomorrow, or never.", "PDF:", "anyone with the link can save the program as a PDF from the link page.")
- After republish yes: REUSED "Published. Your patient now sees the new {name} on the same link:" + "No need to send a new link."
- After publish no: REUSED "Okay, nothing is published." + "({code}) stays as a draft in your Programs, already saved. Ask me to publish it when you're ready." Republish no: REUSED "Okay, I didn't publish. The changes are already saved as a draft, and the link still shows the version from {date_time}. You can publish here or in the web app."
- After set expiry (yes, or no confirm needed): REUSED "Done. The share link for {name} now expires on {date}." For never: APPROVED #9 "Done. The share link for {name} now never expires."
- After set expiry no: APPROVED #10 "Okay, I didn't change it. The link still expires on {current_date}." / "Okay, I didn't change it. The link still never expires."
- After delete yes: REUSED "Deleted {name} and closed its share link. Anyone who opens it sees "This link was closed"." + "You can restore it from Recently deleted in the web app until {date}. The old link stays closed after a restore." No open link: APPROVED #11 "Deleted {name}. You can restore it from Recently deleted in the web app until {date}."
- After delete no: REUSED "Okay, I kept {name}. Nothing changed, and its link still works." No open link: APPROVED #12 "Okay, I kept {name}. Nothing changed."

## Error codes and user-facing messages

Rule: every error is a stable `error_code` the assistant can act on. Where the user needs to be told something, the tool result carries the message below as `summary` and the assistant relays it (it may reword, keeping the same facts). "Code-only" means no user-facing string from the server.

| error_code | Tools | When | Message to the user |
| -- | -- | -- | -- |
| `auth_required` (exists) | all | No or invalid token | Code-only (401 with WWW-Authenticate; the assistant reconnects) |
| `program_not_found` (exists) | all program tools | Missing, another practitioner's, or deleted (identical) | APPROVED #14: "I couldn't find a program with that name or code." |
| `ambiguous_title` (exists) | lookups by title | More than one program has that name | APPROVED #15: "More than one program is called {name}. Which one do you mean?" plus each candidate's code |
| `routine_not_found` (exists) | create from routine | Missing or not the owner's published routine | APPROVED #16: "I couldn't find that routine." |
| `not_supported_v1` (exists) | `get_program_builder_link` | `from_routine_id` only (no `program_code`) and the practitioner owns a published routine head for that id (main) | Code-only. See `get_program_builder_link` with `from_routine_id` under Tools (v13) |
| `exercises_not_found` (partial result, not an error) | create or edit | Some names don't match an approved exercise; the rest saves | REUSED: "{name} isn't in your exercise library yet, and I can't create new exercises from here." + "You can request it in the web app. The search is already filled in:" + "Once a practitioner approves it, ask me again and I'll add it to {program}. The rest of the program is unchanged." |
| `name_required` (exists) | publish | No program name | REUSED: "Add a program name to publish. Use something you will recognise, not the patient's name." |
| `placeholders_block_publish` (exists) | publish | Any placeholder row | REUSED: "Approve or remove placeholders to publish" + "{n} exercises are placeholders. Approve each draft or remove it from this program, then publish." / "One exercise is a placeholder. Approve each draft or remove it from this program, then publish." |
| `missing_images_block_publish` (exists) | publish | Any exercise without start or end image | REUSED: "Remove exercises without images to publish" + "{n} exercises are missing their start or end image. Remove them from this program, then publish." / "One exercise is missing its start or end image. Remove it from this program, then publish." |
| `stale_draft_retry`, `stale_write` (exist) | publish, edit | Draft changed during the call | Code-only. The assistant reads the program again and retries once; if it still fails, `try_again_later` |
| `publish_open_link_closed_race` (exists) | publish | Link closed during publish | Code-only, same as stale |
| `invalid_expiry` (new) | publish overrides, set expiry | Not one of 1_week, 30_days, 90_days, 1_year, never, or a custom date from tomorrow | REUSED: "I can set any date from tomorrow, with no latest date, or make it never expire." |
| `no_live_link` (new) | set expiry | Program was never published or its link is closed | REUSED: "It isn't live yet." + APPROVED #17: "Publish it first, then I can change when the link expires." |
| `patient_details_rejected` (new code for the existing validator) | every free-text field | Text looks like patient details | APPROVED #18: "That looks like patient details. Use a program name you'll recognise, not the patient's name." Retires the unapproved line on main in `src/mcp-connector/patient-detail-validator.ts` |
| `invalid_input` (exists) | all | Schema or argument problem | Code-only (model-facing detail allowed, never treated as copy) |
| `unknown_tool` (new code) | all | Tool name not registered | Code-only |
| `lookup_key_required` (new code) | lookups | Neither program_code nor program_title given | Code-only |
| `try_again_later` (new) | all writes | Unexpected server failure after one retry | APPROVED #19: "Something went wrong on Didi Physio's side. Try again in a minute." |

### DIDI-1196 strings (covered or retired)

| String on main | v13 |
| -- | -- |
| "Program not found" | Retired as copy. `program_not_found` with #14 |
| "Provide program_code or program_title to look up a program." | Retired as copy. Code-only `lookup_key_required` |
| "Invalid tool arguments." | Retired as copy. Code-only `invalid_input` |
| "Unknown tool: …" | Retired as copy. Code-only `unknown_tool` |
| DIDI-1043 stub "Example response: …" summaries | Retired. Stub output is dev-only and must never reach the user; no approved copy |
| Patient-detail validator line (found while reading) | Retired. Replaced by #18 |

## Tools (v13)

Every assistant gets the same tool list and descriptions (DIDI-594 ca41ca4d; DIDI-1243 canceled).

- Tool list: the four read tools on main in `src/mcp-connector/tools.ts` plus the v13 write tools (create or edit a program, create from a routine via `create_or_edit_program` with `from_routine_id`, publish, set program link expiry, delete).
- Read-tool descriptions (all clients; clause deletions only from main `tools.ts`):
  - `search_approved_exercises`: "Search approved exercises visible to the connector. Only approved exercises are returned. Supports limit (default 10, max 25) and an opaque cursor; responses include next_cursor when more results exist. When the query matches nothing, exercises is empty and search_link is the prefilled web app search URL (built from server config). Do not pass patient information."
  - `search_routines`: "Search routines: cookie-cutter programs for common ailments. Includes community library entries and personal copies. Supports limit (default 10, max 25) and an opaque cursor. Do not pass patient information."
  - `get_program_builder_link`: "Deep link to the program builder in the web app. Pass program_code to open that program, or from_routine_id (UUID v4 opaque id) to start a new program from that routine, or omit both for a new blank program. When both program_code and from_routine_id are given, program_code wins and from_routine_id is ignored. No rows are passed in the link. Do not pass patient information."
  - `get_program_share_link_or_pdf`: "Program share link and PDF lookup. Provide program_code or program_title. When a published version exists, returns share_link, pdf_url, and expires_at when live, plus share_link_state. When only a draft exists, publish_link opens the publish page and draft_state is draft_only. When both draft and published exist, draft_state is published_with_draft_changes and has_newer_draft is true. manage_link opens the share page for expiry, close link, and delete. Lookup by program_title works only when exactly one program matches; otherwise the tool returns error_code ambiguous_title with candidates. Do not pass patient information."
- `get_program_builder_link` with `from_routine_id` only (no `program_code`): DIDI-1241 comment 8697c1c0 (Nov 17, 2026, 9:26 PM EST): "get_program_builder_link behaves the same for every client… It returns not_supported_v1 when a published head exists and routine_not_found otherwise, exactly as on main today.… For Muse and Claude, create-from-routine is create_or_edit_program with from_routine_id (DIDI-1244)." (DIDI-1243 sentence in that comment is obsolete. ca41ca4d: every assistant gets write tools; same create-from-routine path.)
- `get_program_builder_link` otherwise: same outputs as main (CTO, 8697c1c0).
- Write-tool descriptions (Diadem, Nov 18, 2026, 2:03 PM EST, DIDI-1251 comment b8c35761):
  - `publish_program`: APPROVED #25: "Publish a program, or publish its draft changes to the same share link. Before calling, ask the user in the conversation and wait for an explicit yes. Read the program first with get_program_share_link_or_pdf so the question has the real name, code, link state and expiry. The question must cover the program name, that it creates or updates the share link, that anyone with the link sees this version, and the expiry and whether it is the default. For a program made from a routine, also say that later routine edits won't change it. For changes to a live program, say what changed and that the patient sees it on the same link. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information."
  - `set_program_link_expiry`: APPROVED #26: "Change when a program's share link expires. The link stays the same. If the user's message already names the date or expiry, call this tool directly. Otherwise, ask the user in the conversation and wait for an explicit yes before calling. Read the program first with get_program_share_link_or_pdf. The question must cover the program name, the new expiry, that it's the same link, and the current expiry. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information."
  - `delete_program`: APPROVED #27: "Delete a program. Before calling, ask the user in the conversation and wait for an explicit yes. Read the program first with get_program_share_link_or_pdf so the question has the real name, code, exercise count and link state. The question must cover the program name, code and exercise count, that it moves to Recently deleted, that its share link closes (only when the link is open), and that it can be restored in the web app for 30 days. Use the approved confirm lines as reference wording. You may reword them if you cover the same facts. If the user says no, don't call this tool. Do not pass patient information."
- Free-text write fields (Diadem, Nov 18, 2026, 2:03 PM EST, DIDI-1251 comment b8c35761; "reuse "Do not pass patient information." on the free-text fields"): no new string. On the write tools, each free-text field description ends with the approved v13 line, verbatim: "Do not pass patient information." Fields (from `src/mcp-connector/json-schema.ts` and DIDI-1242 PR #129): `program_title` (create_or_edit_program input), `row_notes`, row `exercise_name` (create_or_edit_program input rows).

## Consent page

The Oct 31 read-only consent page is retired in v1 (ca41ca4d). One write page for every assistant. Same layout, same Option C card. The app's self-reported name (for example "Muse") shows in the existing "The app calls itself "{name}"" line; this is the only place the user sees Muse named.

| Slot | Write page |
| -- | -- |
| Heading | APPROVED #21: "Allow access to Didi Physio?" |
| It can, 1 | REUSED |
| It can, 2 | REUSED |
| It can, 3 | REUSED |
| It can, 4 | APPROVED #22: "Build and edit your programs, including from a routine" |
| It can, 5 | APPROVED #23: "Publish, change link expiry and delete programs, after you say yes in the chat" |
| It can't, 1 | APPROVED #24: "Create or edit exercises or routines" |
| It can't, 2 | Removed on the write page |
| Patient line, safety line, Deny, Allow, Signed in as, Not you? Sign out, tab title, After Allow, After Deny, invalid client, expired | REUSED unchanged |

Write consent mockups (390 px at 2x and 1280 px at 1x): follow-up. `src/auth/mcp-oauth/consent-html.ts` renders only the read-only page today. Target layout: DIDI-1125 option C final revision (component 466932541740429312, revision 467169139593728000). Sample `{host}` claude.ai, `{name}` Claude, `{email}` practitioner@example.com.

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
- A generic assistant, not any real product. The connector works in ChatGPT, Microsoft Copilot, Grok and Claude.
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
- Supported
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
- A separate copy of Knee osteoarthritis, starter, v3. Later routine edits won't change it.
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

### v13 (approved Nov 17, 2026, 8:35 PM EST)

1. "Reply yes to publish, or tell me a different expiry. No keeps it as a draft."
2. "Reply yes to publish, or no to keep the changes as a draft."
3. "{name} has draft changes that aren't live yet. Do you want the link to the published version, or should I publish the draft first?"
4. "Expires in {expiry} ({date})." / "Never expires."
5. "Change the link for {name} to expire on {date}?" / "Change the link for {name} to never expire?"
6. "It's the same link. Right now it expires on {current_date}." / "It's the same link. Right now it never expires."
7. "Reply yes to change it, or no to leave it."
8. "Reply yes to delete it, or no to keep it."
9. "Done. The share link for {name} now never expires."
10. "Okay, I didn't change it. The link still expires on {current_date}." / "Okay, I didn't change it. The link still never expires."
11. "Deleted {name}. You can restore it from Recently deleted in the web app until {date}."
12. "Okay, I kept {name}. Nothing changed."
13. Removed (ca41ca4d). Was: "This assistant can only look things up in Didi Physio. Use the link to make the change in the web app."
14. "I couldn't find a program with that name or code."
15. "More than one program is called {name}. Which one do you mean?"
16. "I couldn't find that routine."
17. "Publish it first, then I can change when the link expires."
18. "That looks like patient details. Use a program name you'll recognise, not the patient's name."
19. "Something went wrong on Didi Physio's side. Try again in a minute."
20. Removed (ca41ca4d). Was: "This assistant can't make changes. For any change, give the user the matching link." (approved with "Kojo"; changed to "the user" per Diadem's "don't hardcode "Kojo"")
21. "Allow access to Didi Physio?"
22. "Build and edit your programs, including from a routine"
23. "Publish, change link expiry and delete programs, after you say yes in the chat"
24. "Create or edit exercises or routines"

## Changes

- **Oct 23, 2026**: First concept: build in chat, text reply and inline card, not found. https://linear.app/didi-build/issue/DIDI-809
- **Oct 24, 2026**: Connector creates programs and links; all four assistants; read, edit, set expiry, publish and delete with confirms; save vs publish. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-828, https://linear.app/didi-build/issue/DIDI-829
- **Oct 25, 2026**: v10: edits save automatically. https://linear.app/didi-build/issue/DIDI-809
- **Oct 25, 2026**: v11: From a routine, Find by code, 1 year default expiry. https://linear.app/didi-build/issue/DIDI-809, https://linear.app/didi-build/issue/DIDI-852
- **Oct 25, 2026**: v12 approved by Diadem (7:22 PM ET). No change to the connector in v12. https://linear.app/didi-build/issue/DIDI-809
- **Nov 17, 2026**: v13: write tools for every assistant (create, edit, from routine, publish, set expiry, delete) with assistant-side confirms; error codes; write consent page; DIDI-1196 strings covered or retired. Diadem, 8:22 PM EST (DIDI-594 bf5c77d7), 8:35 PM EST (DIDI-594 1d16df1a), 10:34 and 10:36 PM EST (DIDI-594 ca41ca4d). Removed per ca41ca4d: #13, #20, read-only assistants, per-client gating, DIDI-1243, read-only consent page. https://linear.app/didi-build/issue/DIDI-1241
- **Nov 18, 2026**: DIDI-1251, write-tool descriptions #25 to #27 and free-text field guidance approved (Diadem, 2:03 PM EST, comment b8c35761). https://linear.app/didi-build/issue/DIDI-1251
