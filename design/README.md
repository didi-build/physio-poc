# Physio POC design

Approved design for the Physio POC web app and AI assistant connector. Diadem approved it on Oct 25, 2026, 7:22 PM ET ("v12 is approved").

## Convention

- Organised by feature: `design/<area>/<feature>/`. Never by ticket; ticket ids only appear inside files, in each spec's Changes list.
- Each feature folder has `spec.md` (purpose, states, final copy, decisions, locked Product direction quoted from DIDI-594, Changes) and `mockups/` (phone 390 px and desktop 1280 px PNGs, named `NN-state-phone.png` / `NN-state-desktop.png`).
- Copy has no em dashes. No patient information anywhere: programs are found by a practitioner-picked name and a code.
- Every spec states "Matches Product direction: yes", checked against the live DIDI-594 description and comments on Oct 25, 2026.

## Features

| Feature | Folder | Mockups | Dev ticket |
| -- | -- | -- | -- |
| Exercise library (My exercises, All exercises, details, edit for everyone, versions, duplicates and merge, media regeneration) | [app/exercise-library](app/exercise-library/spec.md) | 42 | https://linear.app/didi-build/issue/DIDI-810 |
| Exercise requests (similar check, request form, conflicts, drafts and review) | [app/exercise-requests](app/exercise-requests/spec.md) | 18 | https://linear.app/didi-build/issue/DIDI-810 |
| Routines (community and My routines, update flag, drafts, publish, versions, remove) | [app/routines](app/routines/spec.md) | 46 | https://linear.app/didi-build/issue/DIDI-853 |
| Programs (list and search, builder, codes and names, publish sheet, share link, link page, delete and restore) | [app/programs](app/programs/spec.md) | 67 | https://linear.app/didi-build/issue/DIDI-810 |
| Share link expiry (My defaults, per-program expiry) | [app/settings-link-expiry](app/settings-link-expiry/spec.md) | 8 | https://linear.app/didi-build/issue/DIDI-810 |
| AI assistant connector (Claude-style concept; same tools for ChatGPT, Copilot, Grok) | [connector/claude-connector](connector/claude-connector/spec.md) | 32 | https://linear.app/didi-build/issue/DIDI-810 |

## Design source

| Component | MagicPath link | Component id | Final revision |
| -- | -- | -- | -- |
| Web app, clickable concept | https://designs.magicpath.ai/v1/lucky-river-3731 | 464510460847341568 | 465225161508020224 |
| AI assistant connector, concept | https://designs.magicpath.ai/v1/steadily-brook-7993 | 464510461979815936 | 465211305146613760 |

MagicPath project: 464510439821283328. The connector did not change in v12, so its final revision is the v11 one. The approved source is copied under [reference/](reference/) for convenience; MagicPath is the source of truth.

## Shared layout

- Top nav (desktop) and bottom tab bar (phone): **Exercises / Routines / Programs** only. Requests is not a primary nav tab at either size. Requests moves to the top-right account dropdown (account chip; the approved reference fixture shows "Kojo"): **Requests** on phone and **Requests and drafts** on desktop, with the existing inbox icon and an amber drafts-to-review count (integer only when greater than 0), immediately after the identity line and before My defaults ("Types, links") and Sign out. The Publish and share sheets also link to My defaults ("Your default is 1 year. Change it in My defaults").
- No global search. Exercises, Routines and Programs each have their own search bar.
- Mobile first: every screen works at 390 px (Kojo uses a phone). On 1024 px and up, the builder's publish card floats in a right column.
- Toasts appear at the bottom of the screen; reversible actions (remove, discard, adopt, keep) offer Undo instead of a confirm. Destructive or live-affecting actions (publish, delete program, merge, restore version) use a confirm sheet.

Nav copy (verbatim from the approved navigation spec, DIDI-1173): Exercises; Routines; Programs; account dropdown: Requests (phone) / Requests and drafts (desktop) with inbox icon and amber count when drafts to review; Signed in as Kojo, physiotherapist; My defaults, Types, links; Sign out.

## Shared library layout (DIDI-1178)

Applies to the Exercises and Routines library pages at 390 px (phone) and 1280 px (desktop). Source: approved v12 reference, `design/reference/web-app/generated/WebAppClickableConcept.tsx`. Diadem's report Nov 7, 2026, 2:22 AM America/Toronto, verbatim: "the alignment/spacing in the pages are off (see the blue marks and the yellow marks)" (locked on DIDI-594).

| Element | Approved reference (file:line) | Exercises | Routines |
| -- | -- | -- | -- |
| Shared content gutter | :853 | `mx-auto w-full max-w-6xl flex-1 px-4 pt-4 lg:px-8 lg:pb-12 lg:pt-10` (both) | (both) |
| Title | :856 / :1488 | `text-2xl font-semibold tracking-tight lg:text-3xl` (both) | (both) |
| Title to tabs | :857 / :1491 | `mt-3` (both) | (both) |
| Helper | :858 / :1492 | `mt-3 min-h-[3.75rem] text-sm text-slate-500 sm:min-h-10 lg:min-h-0` (both) | (both) |
| Tabs | :191-192 | `flex border-b border-slate-200`, no outer gutter (shared component) | (shared component) |
| Search wrapper | :859 / :1496 | phone `-mx-4 px-4 py-2`, desktop `lg:mx-0 lg:mt-4 lg:px-5 lg:pb-0 lg:pt-5` | same; Routines adds base `mt-2` on the wrapper |
| Filters | :872-873 / :1504-1505 | `mt-1 lg:mt-0`, inner `px-4 lg:px-5` (both) | (both) |

| Observation (DIDI-594) | Was | Is |
| -- | -- | -- |
| Title to tabs | Exercises gap larger than Routines (video 00:00 vs 00:01) | both use `mt-3` (:857, :1491) |
| Tabs and helper (yellow box) | indented right of the title, search and content | both sit directly on the shared gutter at :853, with no nested padding |
| Vertical gaps (blue marks) | inconsistent | title, tabs, helper, search and filters follow the tokens in the table above |

Rules:

- Tabs and helper take no extra horizontal padding.
- On phone, the search wrapper's `-mx-4 px-4` cancels and then restores the gutter. That pattern is not an indent for other rows.
- Routines' base `mt-2` on search (:1496) and its conditional update banner (:1493-1495) are approved domain differences; keep them.

Mockups (documentation only; existing approved PNGs):

- `design/app/exercise-library/mockups/01-my-exercises-{phone,desktop}.png`, `02-all-exercises-{phone,desktop}.png`
- `design/app/routines/mockups/01-all-routines-{phone,desktop}.png`, `02-my-routines-update-flag-and-draft-{phone,desktop}.png`, `03-search-routines-{phone,desktop}.png`

## Mockup sourcing

States changed in v12 use the approved v12 preview PNGs. States unchanged since earlier versions were **re-rendered from the approved revision** (465225161508020224, connector 465211305146613760) rather than copied from older preview sets, because the older PNGs show retired details (the "Library" nav with three tabs, the 90 day default expiry). So every mockup matches the approved build. A few states are phone only or desktop only where the other size adds nothing (noted in each spec's mockup list). PNGs are palette-compressed (pngquant, quality 80 to 98) to keep the repo small; text and layout are unchanged.

## Locked Product direction

The source of truth is the DIDI-594 description and its "Locked Product direction" comments: https://linear.app/didi-build/issue/DIDI-594. Each spec quotes the parts that apply to it.
