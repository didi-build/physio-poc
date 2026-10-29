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

- Top nav (desktop) and bottom tab bar (phone): **Exercises / Routines / Programs / Requests**, (desktop label "Requests and drafts"), with an amber count on Requests for drafts to review. The account menu ("Signed in as Kojo, physiotherapist") holds My defaults ("Types, links") and Sign out; the Publish and share sheets also link to My defaults ("Your default is 1 year. Change it in My defaults").
- No global search. Exercises, Routines and Programs each have their own search bar.
- Mobile first: every screen works at 390 px (Kojo uses a phone). On 1024 px and up, the builder's publish card floats in a right column.
- Toasts appear at the bottom of the screen; reversible actions (remove, discard, adopt, keep) offer Undo instead of a confirm. Destructive or live-affecting actions (publish, delete program, merge, restore version) use a confirm sheet.

Nav copy (verbatim from the source): Exercises; Routines; Programs; Requests and drafts (phone tab: Requests); account menu: Signed in as Kojo, physiotherapist; My defaults, Types, links; Sign out.

## Mockup sourcing

States changed in v12 use the approved v12 preview PNGs. States unchanged since earlier versions were **re-rendered from the approved revision** (465225161508020224, connector 465211305146613760) rather than copied from older preview sets, because the older PNGs show retired details (the "Library" nav with three tabs, the 90 day default expiry). So every mockup matches the approved build. A few states are phone only or desktop only where the other size adds nothing (noted in each spec's mockup list). PNGs are palette-compressed (pngquant, quality 80 to 98) to keep the repo small; text and layout are unchanged.

## Locked Product direction

The source of truth is the DIDI-594 description and its "Locked Product direction" comments: https://linear.app/didi-build/issue/DIDI-594. Each spec quotes the parts that apply to it.
