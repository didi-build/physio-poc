# 0010. DeepInfra for production exercise stills (FLUX.2 klein 4B)

- **Status:** accepted
- **Date:** 2026-11-18
- **Linear:** [DIDI-1209](https://linear.app/didi-build/issue/DIDI-1209)
- **Supersedes (production default only):** fal provider selection in app wiring; [0006](./0006-didi-1038-flux2-klein-fal-five-exercise-image-test.md) remains the five-exercise manual fal test.

## Context

[DIDI-594](https://linear.app/didi-build/issue/DIDI-594) entry J (Diadem, Nov 10, 2026, 8:30 PM EST), verbatim: "Yes, use DeepInfra for both text and images".

Product still uses **start and end stills** only (no AI video). Model choice remains **FLUX.2 klein 4B** (Oct 29, 2026, 6:42 PM ET, verbatim: "only flux.2 klein"), now served on DeepInfra as `black-forest-labs/FLUX-2-klein-4b`.

[DIDI-1037](https://linear.app/didi-build/issue/DIDI-1037) (fal production API key) is cancelled. The gated five-exercise workflow on fal ([DIDI-1038](https://linear.app/didi-build/issue/DIDI-1038), ADR 0006) stays for manual QA only.

Text inference for later features picks DeepInfra per [DIDI-1008](https://linear.app/didi-build/issue/DIDI-1008); this ADR covers **image** production wiring only.

## Decision

**Production image generation** uses **DeepInfra** serverless inference with **FLUX.2 klein 4B** (`black-forest-labs/FLUX-2-klein-4b`, Apache 2.0 weights, self-hostable later on consumer GPUs).

| Step        | HTTP endpoint                                                 | Notes                                                                          |
| ----------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| Start still | `POST https://api.deepinfra.com/v1/openai/images/generations` | OpenAI-compatible JSON; `response_format: b64_json`; size pinned **1024x1024** |
| End still   | `POST https://api.deepinfra.com/v1/images/edits`              | Multipart: start PNG bytes + end prompt; same model and size                   |

- **Adapter:** `DeepInfraFluxKleinImageGeneration` (`src/adapters/node/deepinfra-flux-klein-image-generation.ts`), plain `fetch`, no SDK; selected when `PHYSIO_DEEPINFRA_API_KEY` is set (`create-image-generation-port.ts`). Otherwise **fake** adapter (local dev, tests, PR CI).
- **Secrets:** API key name `PHYSIO_DEEPINFRA_API_KEY` only; never logged or returned on errors.
- **Prompts:** `src/domain/exercise-media-prompts.ts` — exercise title/starting position, optional regeneration note, fixed clinical illustration template; no patient data.

### FLUX.2 klein edits on DeepInfra (docs-based, not live-tested)

Sources:

- [FLUX 2 Klein 4b model page](https://deepinfra.com/black-forest-labs/FLUX-2-klein-4b) states: "Unified generation & editing — Text-to-image, image editing, and multi-reference in one model" and lists **Editing examples**.
- [OpenAI Images Edits API](https://docs.deepinfra.com/api-reference/image-generation/openai-images-edits) documents `POST /v1/images/edits` with required multipart fields `image`, `prompt`, and `model`.

**Conclusion (docs-based, not live-tested):** DeepInfra documents image edits for FLUX.2 klein 4B via `/v1/images/edits`. The production adapter calls edits first for end stills. It falls back to **prompt-only** text-to-image for the end pose only when the error body **explicitly** states the model does not support edits (generic 422 validation, auth, quota, and billing failures do **not** trigger fallback).

**Seed:** The [model page](https://deepinfra.com/black-forest-labs/FLUX-2-klein-4b) lists a **Seed** parameter. Text-to-image requests (start still and fallback end still) send a pinned `seed` in the JSON body so start and fallback end can stay aligned; the edits multipart schema does not document `seed`, so edit requests omit it.

### Data handling (DeepInfra)

- [Data privacy](https://docs.deepinfra.com/account/data-privacy): inference inputs are held in memory during processing; outputs are not retained except that **image generation outputs may be stored briefly** for demo/access convenience.
- [Terms of Service](https://deepinfra.com/terms): Provider will not use Customer Data to train models except as necessary to provide the Services; Zero Data Retention applies to Provider-hosted models unless Customer opts into features with stated retention.

Regeneration notes flow to DeepInfra only inside the image prompt; they are not stored in D1 or object metadata (unchanged from prior fal wiring).

### Cost

Per [FLUX 2 Klein 4b pricing](https://deepinfra.com/black-forest-labs/FLUX-2-klein-4b): about **$0.014 × (width / 1024) × (height / 1024)** per image; at **1024×1024**, about **$0.014** per still.

## Consequences

- `ImageGenerationPort` is provider-neutral (`ImageGenerationError`; no fal types or provider CDN URLs).
- End regeneration chains from **stored start object bytes**, not provider URLs (`start_provider_url` may remain null for new DeepInfra sets).
- Worker env wiring and R2 remain follow-on tickets (DIDI-1212, DIDI-1040, DIDI-1215).
