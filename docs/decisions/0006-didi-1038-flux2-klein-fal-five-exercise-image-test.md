# 0006. FLUX.2 klein 4B on fal for five-exercise start/end images (supersedes ADR 0005 provider choice)

- **Status:** proposed
- **Date:** 2026-10-30
- **Linear:** [DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038)
- **Supersedes:** [0005](./0005-didi-999-exercise-media-style-and-model-test.md) (provider and model selection only; shared style prompts and exercise list remain)

## Context

Product direction on [DIDI-594](https://linear.app/didi-build/issue/DIDI-594), quoted verbatim:

Diadem, Oct 29, 2026, 5:51 PM ET, CTO chat, recorded on DIDI-594:

> "Yes, okay, just like I thought, right now for V1 or V0 the AI video is simply the start image and the end image that kind of have a transition between the two. So I don't think we need to worry about generating AI videos itself. We need to worry about generating AI images, and then we can find a library or something to stitch those images together with some nice professional kind of transition with them. Yeah. Like, even if it's, if we are thinking it needs to be in the browser, then we don't even need to save the image. We just will need to have the start and the end. And then like U C S S transitions."

V0 and V1 ship start and end AI images with in-browser CSS transitions, not generated AI video.

- 6:42 PM ET: "only flux.2 klein"
- 6:44 PM ET ([DIDI-1028](https://linear.app/didi-build/issue/DIDI-1028)): "Run the klein test on fal, terms accepted"

[ADR 0005](./0005-didi-999-exercise-media-style-and-model-test.md) compared three cloud stacks (Google Vertex, Runway Dev, fal with Seedream + Kling video) for a generation pass that included **video**. That direction is obsolete for V0 and V1: **no AI video**; only **start and end stills** with a **CSS transition** in the browser.

Diadem accepted fal terms for the klein test ([DIDI-1028](https://linear.app/didi-build/issue/DIDI-1028)). The five-exercise manual workflow runs on `main` behind the `media-generation` GitHub Environment ([DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038)).

## Decision

**Proposed:** For the **five-exercise media test only** ([DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038); CTO ruling on [DIDI-999](https://linear.app/didi-build/issue/DIDI-999), Oct 29, 2026, 4:07 PM ET), use **FLUX.2 klein 4B** on **fal.ai** via the gated workflow and `scripts/media-test/`. This ADR does **not** select a production default image provider for the app.

| Step        | fal model ID                  | HTTP endpoint                                 |
| ----------- | ----------------------------- | --------------------------------------------- |
| Start still | `fal-ai/flux-2/klein/4b`      | `https://fal.run/fal-ai/flux-2/klein/4b`      |
| End still   | `fal-ai/flux-2/klein/4b/edit` | `https://fal.run/fal-ai/flux-2/klein/4b/edit` |

- **License:** Apache-2.0 weights; self-hostable later on a **24GB GPU** (consumer-class) per Black Forest Labs and fal documentation.
- **Prompts:** Same shared clinical illustration template and five exercises as ADR 0005 (start vs end pose clause only).
- **Resolution:** About **1 MP** (1024x1024) per still for the test pass.
- **Privacy:** Every fal HTTP call (generation and fal.media download) sends `X-Fal-Store-IO: 0`. API key only from the `FAL_KEY` environment secret on the gated workflow; never in the repo or logs.
- **Cap:** At most **20** fal generations per workflow run (10 for the five-exercise pass; headroom for retries is not used in the default script path).

Implementation: `scripts/media-test/` and `.github/workflows/media-test.yml` ([DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038)).

## Terms risks (desk research; no recommendation)

Whether Physio's exercise-education use is restricted is for Diadem in the provider-pick RfM, not decided here.

**fal (chosen gateway for this test).** **terms risk: PHI collection clause in Acceptable Use Policy; needs Diadem's call.** [fal Acceptable Use Policy](https://fal.ai/legal/acceptable-use-policy), scope: Section 7, Security, item 1 (retrieved 2026-10-30), verbatim:

> Collecting, processing, or disclosing personal or sensitive information such as (i) Personally identifiable information (PII). (ii) Protected health information (PHI).

**Google Vertex (dropped for this test).** **terms risk: clinical-purpose restriction; needs Diadem's call.** Verbatim quote in [ADR 0005 section A](./0005-didi-999-exercise-media-style-and-model-test.md) (Service Specific Terms s. 20(e), retrieved 2026-10-29):

> Customer will not, and will not allow End Users to, use the Generative AI Services for clinical purposes (for clarity, non-clinical research, scheduling, or other administrative tasks is not restricted), as a substitute for professional medical advice, or in any manner that is overseen by or requires clearance or approval from any applicable regulatory authority.

**Runway Dev (dropped for this test).** Verbatim quotes in [ADR 0005 section B](./0005-didi-999-exercise-media-style-and-model-test.md) (retrieved 2026-10-29): Runway Usage Policy (Characters and Game Worlds scope):

> Characters or games that are intended to provide medical, legal, or financial advice or mimic professional therapeutic or counseling interventions.

Runway Terms of Use, Runway App Studio, Prohibited Apps, (v):

> collect protected health information, payment card data, financial account numbers, or government identifiers

## Reasons (why ADR 0005 candidates were dropped)

| Former ADR 0005 track                              | Why dropped for Physio V0/V1                                                                                                                                                        |
| -------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Video** (Veo, Runway `gen4_turbo`, Kling on fal) | Product direction: **no AI video in V0 or V1** (DIDI-594 quote above). CSS transition between start and end images only.                                                            |
| **Google Vertex** (Gemini image + Veo)             | Video out of scope; GCP clinical-use terms risk in ADR 0005 remains unresolved; no need for a second vendor for stills-only.                                                        |
| **Runway Dev** (Gen-4 image + video)               | Video out of scope; Runway stack was chosen for paired video; still-only test does not need Runway credits.                                                                         |
| **fal Seedream + Kling** (ADR 0005 option C)       | Video out of scope; Kling was the fal video pick. Stills-only test targets **klein** per direction.                                                                                 |
| **Other image models** (e.g. Qwen-Image)           | **Self-hostability:** klein 4B targets ~24GB GPU; Qwen-Image class models commonly need **~80GB GPU** for comfortable self-hosting, which is a poor fit for a later on-prem option. |
| **Black Forest Labs hosted API** (non-fal)         | **BFL API trains on customer inputs** per BFL API terms reviewed in provider pick; fal route keeps a single gateway and accepted fal terms for this test.                           |
| **Only flux.2 klein** (DIDI-594)                   | Matches Apache-2.0 klein 4B on fal with native text-to-image and edit endpoints for start/end consistency.                                                                          |

## Consequences

- ADR 0005 remains the record for desk research and shared prompts; **provider and model IDs in 0005 are superseded** by this ADR for the manual five-exercise test only.
- Application code must not treat this ADR as a production provider default until Diadem and Kojo sign off on the five-exercise artifact ([DIDI-1028](https://linear.app/didi-build/issue/DIDI-1028)).
- Production storage, UI, D1, and regenerate caps stay out of scope ([DIDI-1013](https://linear.app/didi-build/issue/DIDI-1013)).
- CTO **head-pinned sign-off** on the workflow and script at merge head is required before QA merges ([DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038) acceptance).

## References

- [DIDI-594 Product direction](https://linear.app/didi-build/issue/DIDI-594)
- [DIDI-1028 Provider pick](https://linear.app/didi-build/issue/DIDI-1028)
- [ADR 0005 Exercise media style and model test](./0005-didi-999-exercise-media-style-and-model-test.md)
- [fal FLUX.2 klein 4B text-to-image](https://fal.ai/models/fal-ai/flux-2/klein/4b/llms.txt)
- [fal FLUX.2 klein 4B edit](https://fal.ai/models/fal-ai/flux-2/klein/4b/edit/llms.txt)
