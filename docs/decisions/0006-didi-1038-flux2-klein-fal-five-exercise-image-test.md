# 0006. FLUX.2 klein 4B on fal for five-exercise start/end images (supersedes ADR 0005 provider choice)

- **Status:** proposed
- **Date:** 2026-10-30
- **Linear:** [DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038)
- **Supersedes:** [0005](./0005-didi-999-exercise-media-style-and-model-test.md) (provider and model selection only; shared style prompts and exercise list remain)

## Context

Product direction on [DIDI-594](https://linear.app/didi-build/issue/DIDI-594), quoted verbatim:

- 5:51 PM ET, Oct 29, 2026: no AI video in V0 or V1. Each exercise gets AI start and end images, with a browser CSS transition between them.
- 6:42 PM ET: "only flux.2 klein"
- 6:44 PM ET ([DIDI-1028](https://linear.app/didi-build/issue/DIDI-1028)): "Run the klein test on fal, terms accepted"

[ADR 0005](./0005-didi-999-exercise-media-style-and-model-test.md) compared three cloud stacks (Google Vertex, Runway Dev, fal with Seedream + Kling video) for a generation pass that included **video**. That direction is obsolete for V0 and V1: **no AI video**; only **start and end stills** with a **CSS transition** in the browser.

Diadem accepted fal terms for the klein test ([DIDI-1028](https://linear.app/didi-build/issue/DIDI-1028)). The five-exercise manual workflow runs on `main` behind the `media-generation` GitHub Environment ([DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038)).

## Decision

**Proposed:** Use **FLUX.2 klein 4B** on **fal.ai** for the five-exercise image test and as the default image provider choice until a later production ADR:

| Step        | fal model ID                  | HTTP endpoint                                 |
| ----------- | ----------------------------- | --------------------------------------------- |
| Start still | `fal-ai/flux-2/klein/4b`      | `https://fal.run/fal-ai/flux-2/klein/4b`      |
| End still   | `fal-ai/flux-2/klein/4b/edit` | `https://fal.run/fal-ai/flux-2/klein/4b/edit` |

- **License:** Apache-2.0 weights; self-hostable later on a **24GB GPU** (consumer-class) per Black Forest Labs and fal documentation.
- **Prompts:** Same shared clinical illustration template and five exercises as ADR 0005 (start vs end pose clause only).
- **Resolution:** About **1 MP** (1024x1024) per still for the test pass.
- **Privacy:** Every fal request sends `X-Fal-Store-IO: 0`. API key only from the `FAL_KEY` environment secret on the gated workflow; never in the repo or logs.
- **Cap:** At most **20** fal generations per workflow run (10 for the five-exercise pass; headroom for retries is not used in the default script path).

Implementation: `scripts/media-test/` and `.github/workflows/media-test.yml` ([DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038)).

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

- ADR 0005 remains the record for desk research and shared prompts; **provider and model IDs in 0005 are superseded** by this ADR for implementation and the manual test.
- Application code must not hard-code other image or video providers until Diadem and Kojo sign off on the five-exercise artifact ([DIDI-1028](https://linear.app/didi-build/issue/DIDI-1028)).
- Production storage, UI, D1, and regenerate caps stay out of scope ([DIDI-1013](https://linear.app/didi-build/issue/DIDI-1013)).
- CTO **head-pinned sign-off** on the workflow and script at merge head is required before QA merges ([DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038) acceptance).

## References

- [DIDI-594 Product direction](https://linear.app/didi-build/issue/DIDI-594)
- [DIDI-1028 Provider pick](https://linear.app/didi-build/issue/DIDI-1028)
- [ADR 0005 Exercise media style and model test](./0005-didi-999-exercise-media-style-and-model-test.md)
- [fal FLUX.2 klein 4B text-to-image](https://fal.ai/models/fal-ai/flux-2/klein/4b/llms.txt)
- [fal FLUX.2 klein 4B edit](https://fal.ai/models/fal-ai/flux-2/klein/4b/edit/llms.txt)
