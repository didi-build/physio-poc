# Draft review AI generation states

Area: app · Feature: draft-review-ai-states

## Purpose

On the **draft review** page ([exercise-requests/spec.md](../exercise-requests/spec.md)), real AI generation runs when the requester opens the page: text first, then start and end images (DeepInfra, [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) entry J, [DIDI-1210](https://linear.app/didi-build/issue/DIDI-1210)). This spec covers **variant B**: the page **fills in place**; a teal progress strip sits at the top and each section shows its own status until the first draft is complete. It also covers **in progress elsewhere**, **generation failure with retry**, the **daily AI limit**, **regenerate text with a note**, and the updated **Regenerate** sheet (no video, no AI image tag).

Parent flows (search, request, requests list, approved) stay in [exercise-requests/spec.md](../exercise-requests/spec.md). Body region on draft review stays in [body-region-picker/spec.md](../body-region-picker/spec.md).

**Matches Product direction: yes.** Checked against [DIDI-594](https://linear.app/didi-build/issue/DIDI-594) entry J (comment `9d5e7ab5`, DeepInfra text and images), DIDI-829 media regeneration cap (5 per practitioner per day for media regenerates), the Oct 29, 2026 media direction (start and end images with a browser transition, no AI video in V0 and V1, as quoted in [programs/spec.md](../programs/spec.md)), and DIDI-1210 locks `f0d278ce`, `cfbd2e59`, `8b02e1ef`, `673158e8`, `b8ac5450`, and `a887af34`.

## Design source (approved Nov 20 to 21, 2026)

| Choice | MagicPath link | Component id | Revision |
| -- | -- | -- | -- |
| B. Fills in place (final) | https://designs.magicpath.ai/v1/bright-air-5265 | 471080415449468928 | 471080825279098880 |

**Diadem, Nov 20, 2026, 10:43 AM EST**, verbatim (locked on DIDI-594 comment `f0d278ce`): `1210: B`.

Source: `DrBoard.tsx` / `BFillsInPlace.tsx`, revision `471080825279098880`. Board captures: [overview](mockups/00-magicpath-board-overview.png), [full board](mockups/00-magicpath-board-full.png) (390 px and 1280 px columns on one canvas). Per-state frames use `data-frame="{state}-390"` and `data-frame="{state}-1280"` in that revision. No design-preview chrome in build.

## Variant B behaviour

| Topic | Rule |
| -- | -- |
| Layout | **B. Fills in place** (`f0d278ce`). The draft review chrome stays on one page; sections fill as data arrives. |
| Progress strip | While the **first draft** is not complete, a teal **AI drafting** strip (with indeterminate bar) **replaces** the amber **Draft, not approved** banner. When the draft is complete, the banner returns. |
| Section order (phone) | **Images** card above **Exercise details**, matching `DraftReviewPage` DOM order. At **1280 px**, two columns: text left, images right (existing `.ex-review-grid`). |
| Text then images | Server orders text before images. **Exercise details** shows **Generating** until text exists, then read-only field copy (no **Edit** links). **Images** shows **Generating** until both stills exist. |
| Approve / Regenerate | **Approve** and **Regenerate** stay **disabled** until text and both images are ready (no half-approved draft). Nothing half-filled is shown as an approved-quality draft. No extra hint line under the buttons: the progress strip and section **Generating** labels explain the wait (Designer pick, `a887af34`). |
| Edit | No per-field **Edit** and no **Edit all** until the whole first draft is ready. |
| Motion | Start and end stills use the existing **browser transition** between images (`ExerciseMotion.tsx`). **No AI video** is generated, shown, or regenerated on this page. |
| AI image tag | **No** "AI image" tag on stills on this page (`673158e8`). Removal elsewhere is [DIDI-1268](https://linear.app/didi-build/issue/DIDI-1268), not this PR. |
| In progress elsewhere | Same UI as **Generating**, plus approved string 8 in the progress strip (`8b02e1ef` item 5). The page subscribes or polls; no second job is started. |
| Text failure | String 1 in a failure region. Retry control is **Regenerate text** (string 6), not **Try again**. No draft text is shown. |
| Image failure | String 2 in the **Images** section. Retry is **Try again** (Designer pick, DIDI-594 comment `a887af34` item 24; reuses `AUTO_SAVE_TRY_AGAIN` from `programs.ts`, earlier **Try again** lock `fed76bfb`). Text fields stay visible read-only. |
| Daily limit | Shown when the server daily AI cap is hit ([DIDI-1214](https://linear.app/didi-build/issue/DIDI-1214)). **Daily limit reached.** plus string 3. No retry until the next day. |
| Regenerate text | Available on the **Regenerate** sheet as **Text only** (string 4). Confirm **Regenerate text** (string 6). While running, string 7. **Skips** the 5-a-day client counter; only the server cap applies (`8b02e1ef` item 1). |
| Daily counter | `{n} of 5 left today` (`regenLeftText`) counts **regenerates only**; the **first draft does not count** (`8b02e1ef` item 2). |
| Regenerate media | Still uses the 5-a-day cap per practitioner for image (and former video) regenerates. |

## Regenerate sheet

Opened from **Regenerate** when the draft is complete (or when media regen is allowed). Wording after `b8ac5450` and `8b02e1ef` item 3:

| Scope option | Label | Hint |
| -- | -- | -- |
| All | **Text and images** | (no sub-hint in exploration; body is the shared sheet intro only) |
| Images | **Images only** | **Start and end images. Text stays.** |
| Text | **Text only** (string 4) | **All the written fields. Images stay.** |

Reused sheet chrome from [exercise-requests/spec.md](../exercise-requests/spec.md) copy inventory: **Regenerate**, **Choose what the AI should redo. Your edits to anything else are kept.**, **What to regenerate**, **Note for the AI**, **(optional)**, placeholder **For example: show forearm support, not straight arm**, **You can undo afterwards. The previous version is kept.**, confirm **Regenerate images** or **Regenerate text** (string 6) depending on scope.

**Removed from sheet (is/was):** **Text, images and video**, **The 6s loop**, **Regenerate video**, and hints that mention video. See is/was below.

## States (mockups)

| # | State | What it shows | MagicPath frame (390 / 1280) |
| -- | -- | -- | -- |
| 01 | gen-text | Strip + title; **Exercise details** generating; **Images** waiting; disabled **Approve** / **Regenerate**; `{n} of 5 left today` | `genText-390` / `genText-1280` |
| 02 | gen-images | Text sections filled read-only; **Images** generating | `genImages-390` / `genImages-1280` |
| 03 | elsewhere | Same as 01 or 02 plus string 8 in the strip | `elsewhere-390` / `elsewhere-1280` |
| 04 | fail-text | String 1; **Regenerate text** retry; no draft body | `failText-390` / `failText-1280` |
| 05 | fail-images | String 2 in **Images**; **Try again**; text kept read-only | `failImages-390` / `failImages-1280` |
| 06 | limit | **Daily limit reached.** and string 3; regenerates blocked | `limit-390` / `limit-1280` |
| 07 | sheet | Regenerate sheet with **Text only** option and reworded labels | `sheet-390` / `sheet-1280` |
| 08 | regen-text | String 7 while text regenerates; other sections usable | `regenText-390` / `regenText-1280` |
| 09 | ready | Complete draft: banner back, **Approve** enabled, motion between stills, no tag | `ready-390` / `ready-1280` |

**Board references (all states on one canvas):** [overview](mockups/00-magicpath-board-overview.png) · [full capture](mockups/00-magicpath-board-full.png) · MagicPath revision `471080825279098880`.

## Copy and accessibility

### Approved strings (Diadem, Nov 20 to 21, 2026)

| Id | String | When approved |
| -- | -- | -- |
| G1 | The AI couldn't write the text. | Nov 20, 10:43 AM EST (`cfbd2e59` string 1) |
| G2 | The AI couldn't make the images. The text is kept. | Nov 20, 10:43 AM EST (`cfbd2e59` string 2) |
| G3 | You can try again tomorrow. | Nov 20, 10:43 AM EST (`cfbd2e59` string 3) |
| G4 | Text only | Nov 20, 10:43 AM EST (`cfbd2e59` string 4) |
| G5 | All the written fields. Images stay. | Nov 21, 12:45 AM EST (`b8ac5450`, supersedes suspended string 5) |
| G6 | Regenerate text | Nov 20, 10:43 AM EST (`cfbd2e59` string 6) |
| G7 | Regenerating the text. Everything else stays usable. | Nov 20, 10:43 AM EST (`cfbd2e59` string 7) |
| G8 | Already started. This page updates when the draft is ready. | Nov 20, 10:43 AM EST (`cfbd2e59` string 8) |
| G9 | Text and images | Nov 21, 12:45 AM EST (`b8ac5450`, sheet all-scope label) |
| G10 | Start and end images. Text stays. | Nov 21, 12:45 AM EST (`b8ac5450`, images-only hint) |

**Diadem, Nov 20, 2026, 10:43 AM EST**, verbatim (`cfbd2e59`): "Yes, approve all 8 strings" (G1 to G8 as originally listed; G5 reworded under `b8ac5450`).

**Diadem, Nov 21, 2026, 12:45 AM EST**, verbatim (`b8ac5450`): "approve" for the three rewords (G5, G9, G10).

### Designer pick (not Diadem's words)

**Standing rule** (Diadem, Nov 21, 2026, 12:58 AM EST, DIDI-594 comment `a887af34`), verbatim: "going forward please pick something reasonable. only ask me if it's a true product decision that you are unsure about"

| Id | String / choice | Citation |
| -- | -- | -- |
| G11 | **Try again** as the visible label for image-generation or image-regenerate failure retry | DIDI-594 `a887af34` item 24 (Designer pick under the standing rule; matches `AUTO_SAVE_TRY_AGAIN` / prior **Try again** lock `fed76bfb`) |
| G12 | No helper text under disabled **Approve** during the first draft; progress strip and **Generating** only | Designer pick under the standing rule (`a887af34`; progress wording is already approved reuse) |

### Reused from [exercise-requests/spec.md](../exercise-requests/spec.md)

Includes **AI drafting**, **Usually ready in a minute**, **Generating**, **Approve**, **Regenerate**, `{n} of 5 left today`, **Daily limit reached.**, **Images**, **Exercise details**, section and field labels, **Regenerating everything. This takes about a minute.** (full media regen), and sheet strings listed above.

### Accessibility

| Element | Markup / behaviour |
| -- | -- |
| Teal progress strip | `aria-live="polite"` while the first draft is in progress or **in progress elsewhere**; announces **AI drafting** and, when applicable, G8. |
| Section **Generating** | Polite status in the section (visible **Generating** plus spinner); does not steal focus on each partial fill. |
| Text failure | `role="alert"` for G1; focus moves to **Regenerate text** (G6) when the failure appears. |
| Image failure | `role="alert"` for G2 inside **Images**; focus moves to **Try again** (G11). |
| Daily limit | `role="alert"` combining **Daily limit reached.** and G3; no retry control. |
| Text regen in progress | `role="status"` with G7 (`aria-live="polite"`). |
| Regenerate sheet | `role="dialog"`, labelled by **Regenerate**; focus trap; **Close** uses `ARIA_CLOSE_SCRIM`. On close, focus returns to **Regenerate**. |
| Approve disabled | `aria-disabled` / `disabled` until text and both images exist. No `aria-describedby` helper under the toolbar (G12). |
| Motion | `prefers-reduced-motion`: still show start and end stills without animating the transition (same rule as link page). |
| Stills | Alt text `{title}, start position` / `{title}, end position` (reuse link-page pattern). **No** "AI image" in alt or on-screen tag. |

## Is/was (DIDI-1210 scope)

| Topic | Is | Was |
| -- | -- | -- |
| Layout while generating | Variant B: fills in place (`f0d278ce`) | Baseline v12 review: static draft with no per-section status |
| Draft banner during first gen | Teal **AI drafting** strip | **Draft, not approved** banner always |
| Video on review page | None; browser transition only | **AI video, 6s loop** copy and video regen on sheet ([exercise-requests](../exercise-requests/spec.md) inventory) |
| Regenerate sheet "all" label | **Text and images** (G9) | **Text, images and video** |
| Images-only hint | **Start and end images. Text stays.** (G10) | **Start and end images. Text and video stay.** |
| Text-only hint | **All the written fields. Images stay.** (G5) | **All the written fields. Images and video stay.** (suspended) |
| Video regen options | Removed | **The 6s loop**, **Regenerate video** |
| AI image tag on stills | Not shown (`673158e8` on this page) | **AI image** tag on placeholders and stills |
| Regenerate text vs daily 5 | Text regen uses server cap only (`8b02e1ef`) | Undecided in v12 |
| First draft vs counter | First draft free; counter is regenerates only (`8b02e1ef`) | Undecided |
| In progress elsewhere | Generating UI + G8 (`8b02e1ef`) | Not specified |
| Hint under disabled **Approve** | None during first generation (G12, `a887af34`) | MagicPath exploration proposed a one-line hint |

## Locked Product direction (verbatim from DIDI-594)

**DIDI-594 comment `9d5e7ab5`, entry J: DeepInfra for AI exercise text and images** (https://linear.app/didi-build/issue/DIDI-594):

> Diadem, directly in CTO's chat, verbatim:
>
> * Nov 10, 2026, 8:23 PM EST: "separately, I would like to integrate AI into the flow (creating exercises) now so I can demo full flow to Kojo. what do we need to do? I'm thinking of using deepinfra for the models"
> * Nov 10, 2026, 8:30 PM EST, answering "Go with DeepInfra for both exercise text and images?": "Yes, use DeepInfra for both text and images"

**DIDI-594 description, Exercise database (Oct 23, 2026)** (abridged; full block in [exercise-requests/spec.md](../exercise-requests/spec.md)):

> * **AI draft.** The AI fills a fixed text template … It also generates visuals … start and end images and a short looping video. Everything is marked as a draft.
> * **Review.** Kojo approves, edits the text, or asks for a regeneration with a note.

**DIDI-594 comment `9d5e7ab5` and DIDI-829 / media cap:** 5 regenerations per practitioner per day apply to **media** regenerates; this spec adds the **Regenerate text** exception (`8b02e1ef`).

**Oct 29, 2026 media direction** (quoted in [programs/spec.md](../programs/spec.md)): start and end images with a **browser transition**, **no AI video** in V0 and V1. This spec removes AI video from the **draft review** UX to match.

**Diadem, Nov 20, 2026, 10:46 AM EST** (`8b02e1ef`), verbatim widget answers:

1. "Regenerate text skips the 5-a-day limit and only hits the server cap"
2. "The first draft doesn't count, only regenerates do"
3. "Drop "video" from the regenerate sheet wording"
4. "Drop the AI image tag"
5. "In progress elsewhere looks the same as Generating, plus the Already started line"

**Diadem, Nov 20, 2026, 10:47 AM EST** (`673158e8`), verbatim: "Drop the AI image tag everywhere, including the library, share link and PDF" (library/share/PDF follow-up: DIDI-1268).

## Decisions

1. Variant **B** only (`f0d278ce`). Variants A and C on the MagicPath board are exploration only.
2. Text failure retries with **Regenerate text** (G6); image failure uses **Try again** (G11, `a887af34`).
3. No AI video and no AI image tag on this page (`8b02e1ef`, `673158e8`).
4. Mobile first at **390 px**; **1280 px** uses the existing two-column review grid.
5. No gallery components in the Physio POC (spec and mockups only).
6. No **Approve** toolbar hint during first generation (G12, `a887af34`).

## Build notes

- Orchestration and API sequencing: [DIDI-1215](https://linear.app/didi-build/issue/DIDI-1215) (blocked on this spec).
- Server daily AI cap: [DIDI-1214](https://linear.app/didi-build/issue/DIDI-1214).
- Parent feature: [DIDI-1210](https://linear.app/didi-build/issue/DIDI-1210).

## Changes

- **Nov 21, 2026**: DIDI-1210 PR follow-up. G12: no **Approve** hint during first generation (Designer pick, `a887af34`). https://linear.app/didi-build/issue/DIDI-1210
- **Nov 21, 2026**: DIDI-1210. Variant B draft review AI states: generating, in progress elsewhere, failures, daily limit, Regenerate text, sheet rewords, cap rules, copy table, is/was for video and AI image tag. Diadem locks `f0d278ce`, `cfbd2e59`, `8b02e1ef`, `673158e8`, `b8ac5450`; Designer picks G11 to G12 under `a887af34`. Unblocks [DIDI-1215](https://linear.app/didi-build/issue/DIDI-1215). https://linear.app/didi-build/issue/DIDI-1210