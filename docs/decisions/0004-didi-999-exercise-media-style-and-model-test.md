# 0004. Exercise media visual style and model (five-exercise test)

- **Status:** proposed
- **Date:** 2026-10-29
- **Linear:** [DIDI-999](https://linear.app/didi-build/issue/DIDI-999) (desk research under epic [DIDI-594](https://linear.app/didi-build/issue/DIDI-594))

## Context

Product direction (locked on DIDI-594, quoted in [design/app/exercise-requests/spec.md](../../design/app/exercise-requests/spec.md) and [design/app/exercise-library/spec.md](../../design/app/exercise-library/spec.md)) requires AI draft exercises to ship **start and end images and a short looping video** in **one consistent style**, with a **five-exercise test** before committing to a provider, because **AI video often gets joint angles wrong** and **Kojo's review time is the bottleneck**. The design specs name no model or visual style.

This record is **Option A desk research only** (CTO ruling): no API keys, no live generation, no images or videos in the repo. A later pass will run generation manually via GitHub (described below, not implemented here).

**Out of scope for candidates:** OpenAI's Sora 2 and Videos API were shut down on 2026-09-24 with no one-to-one replacement ([OpenAI video generation guide](https://developers.openai.com/api/docs/guides/video-generation), accessed 2026-10-29). GPT Image models remain for stills only; they are not paired with a current OpenAI video API for this test.

## Shared style prompt template

Use the **same text** for every candidate. Only `{EXERCISE_NAME}` and the pose clause (`{POSE}`) change. No patient names, demographics, diagnoses, or real-world identifiers.

**Template (images and video):**

```text
Clinical physiotherapy exercise demonstration: {EXERCISE_NAME}. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. {POSE}
```

**Pose clauses:**

| Asset            | `{POSE}` value                                                                                                                                |
| ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Start image      | `Hold the starting position of the exercise, stable and anatomically neutral.`                                                                |
| End image        | `Hold the end position of the exercise, stable and anatomically neutral.`                                                                     |
| Video (6 s loop) | `Smooth repeating loop from starting position to end position and back, controlled tempo suitable for rehab instruction, no camera movement.` |

### Exact prompts per test exercise

| #   | Exercise                           | Start image prompt                                                                                                                                                                                                                                                                                                                                                                                                                                               | End image prompt                                     | Video prompt                              |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | ----------------------------------------- |
| 1   | Bridge                             | `Clinical physiotherapy exercise demonstration: bridge glute bridge. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.`             | Same with `bridge glute bridge` and end pose clause. | Same exercise name and video pose clause. |
| 2   | Straight leg raise (rehab, supine) | `Clinical physiotherapy exercise demonstration: straight leg raise rehab supine. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.` | Same with end pose clause.                           | Same with video pose clause.              |
| 3   | Sit to stand                       | `Clinical physiotherapy exercise demonstration: sit to stand. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.`                    | Same with end pose clause.                           | Same with video pose clause.              |
| 4   | Band shoulder rotation             | `Clinical physiotherapy exercise demonstration: band shoulder external rotation. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.` | Same with end pose clause.                           | Same with video pose clause.              |
| 5   | Heel slides                        | `Clinical physiotherapy exercise demonstration: heel slides supine. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.`              | Same with end pose clause.                           | Same with video pose clause.              |

For rows 1, 3, 4, and 5, end and video prompts mirror the start prompt with the appropriate `{POSE}` sentence from the table above (full strings omitted here only to limit duplication; generation must paste the complete prompt text).

## Candidate providers (desk research)

Three candidates cover **first-party cloud**, **Runway-native Dev API**, and **fal.ai as a multi-model gateway** (still one fixed image+video pair each for the test). Recommended model IDs for the generation pass are listed so every candidate uses one image model and one video model consistently.

### Summary comparison

|                                   | **A. Google Cloud Vertex AI**                                                                                                                                                                                                                                                                                                                                               | **B. Runway Dev (native models)**                                                                                                                                                                                                                                                                                                                                                                                                                                                  | **C. fal.ai (hosted third-party models)**                                                                                                                                                                                                                                             |
| --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image model                       | `imagen-4.0-generate-001` (see endpoint note below)                                                                                                                                                                                                                                                                                                                         | `gen4_image_turbo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `fal-ai/bytedance/seedream/v4.5/text-to-image`                                                                                                                                                                                                                                        |
| Video model                       | `veo-3.1-generate-001` (6 s, no audio)                                                                                                                                                                                                                                                                                                                                      | `gen4_turbo`                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` (start frame + optional tail frame)                                                                                                                                                                                                |
| Est. cost / exercise              | **$0.28** (2 x $0.04 + 1 x $0.20)                                                                                                                                                                                                                                                                                                                                           | **$0.34** (4 + 30 credits x $0.01)                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **$0.50** (2 x $0.04 + 6 s video; see duration note)                                                                                                                                                                                                                                  |
| Est. latency                      | Imagen: low vs conversational image models ([when to use Imagen](https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview), accessed 2026-10-29). Veo: async long-running operation ([text-to-video doc](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-text), accessed 2026-10-29). **Wall-clock seconds: unverified.** | **Unverified** (no public SLA on dev docs reviewed).                                                                                                                                                                                                                                                                                                                                                                                                                               | Queue-based API; **wall-clock seconds: unverified**.                                                                                                                                                                                                                                  |
| Output ownership / commercial use | Generated Output is Customer Data; Google does not assert ownership ([Service Specific Terms, Generative AI Services](https://cloud.google.com/terms/service-terms), accessed 2026-10-29). Commercial use subject to Agreement and [Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy), accessed 2026-10-29).                 | Runway Dev: does not restrict commercial use of outputs subject to Terms and Usage Policy ([commercial use](https://dev.runway.com/learn/commercial-use), accessed 2026-10-29). Runway does not claim output ownership ([same](https://dev.runway.com/learn/commercial-use), accessed 2026-10-29).                                                                                                                                                                                 | Customer owns Customer Input; Output Content use must be lawful and non-infringing ([Terms of Service](https://fal.ai/terms), accessed 2026-10-29). fal does not warrant exclusive IP in outputs ([same](https://fal.ai/terms), accessed 2026-10-29).                                 |
| Training on inputs                | Google will not train on Customer Data without permission ([Training Restriction](https://cloud.google.com/terms/service-terms), accessed 2026-10-29).                                                                                                                                                                                                                      | Pay-as-you-go: public learn article describes default provider behavior; **contractual no-training on Enterprise** ([Enterprise](https://dev.runway.com/enterprise), accessed 2026-10-29). Self-serve Runway web Terms allow use of inputs/outputs to improve models ([Runway Terms of Use s. 4.4](https://runwayml.com/terms-of-use), accessed 2026-10-29); **whether that applies to Runway Dev API accounts: unverified** (prefer Enterprise terms if no-training is required). | fal API Services: Company will not use Client Content to train Company products ([API Services s. 2.4](https://fal.ai/legal/api-services), accessed 2026-10-29). Third-party model upstream terms may differ ([same s. 2.3](https://fal.ai/legal/api-services), accessed 2026-10-29). |
| Data retention                    | Prompts and Generated Output not stored outside Customer's Account longer than necessary to create output, absent permission ([Service Specific Terms s. 20(h)](https://cloud.google.com/terms/service-terms), accessed 2026-10-29).                                                                                                                                        | Enterprise: zero data retention supported ([Enterprise](https://dev.runway.com/enterprise), accessed 2026-10-29). Self-serve: **default retention: unverified** on pages reviewed.                                                                                                                                                                                                                                                                                                 | Standard backup/archival retention may apply to Confidential Information ([Terms s. 7.5](https://fal.ai/terms), accessed 2026-10-29). **Prompt/output retention duration: unverified** beyond confidentiality section.                                                                |
| Joint angle / anatomy (public)    | **Veo 3.1 fast** scored 90.8 overall on HumanScore biomechanics benchmark (13 video models); gap vs real video remains ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). No Imagen-specific physiotherapy study found.                                                                                                                                | **Gen-4 Turbo / Gen-4 Image:** no entry in HumanScore leaderboard ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). General video failure modes: unstable bone length, implausible joints, temporal jitter ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29).                                                                                                                                                                           | **Kling 2.5 Turbo Pro** scored 90.8 overall on HumanScore; leads kinematic dimension ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). Seedream: **no HumanScore entry; unverified** for static pose accuracy.                                                  |

### A. Google Cloud Vertex AI (Imagen 4 + Veo 3.1)

**Why short-listed:** Single-vendor image and video on GCP, explicit 6 s Veo duration, enterprise-friendly terms, and published per-generation pricing.

**Endpoint note:** Vertex image docs list deprecation of Imagen 4 endpoints in favor of `gemini-2.5-flash-image` before 2026-06-30 ([image overview](https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview), accessed 2026-10-29). The generation pass must confirm which endpoint is live in the target project before spend.

**Cost per exercise (2 images + 1 x 6 s video, 720p, video without audio):**

| Line                              | Source                                                                                                                         | Calculation           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | --------------------- |
| 2 x Imagen 4 image                | [Agent Platform pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing), accessed 2026-10-29 | 2 x $0.04 = **$0.08** |
| 1 x Veo 3.1 video generation 720p | [same table](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing), accessed 2026-10-29             | **$0.20** per count   |
| **Total**                         |                                                                                                                                | **$0.28**             |

Assumption: one billed "count" per generated video regardless of 4/6/8 s length ([Veo 3.1 model card](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate), accessed 2026-10-29). **If billing differs in the console: unverified.**

**Latency:** Imagen positioned as lower latency than Gemini image routes ([overview comparison table](https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview), accessed 2026-10-29). Veo uses long-running operations ([generate videos from text](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-text), accessed 2026-10-29). End-to-end time per exercise: **unverified.**

**Licence and restrictions:** Generated Output is Customer Data; Google disclaims accuracy and prohibits clinical use of Generative AI Services as substitute for professional medical advice ([Service Specific Terms s. 20](https://cloud.google.com/terms/service-terms), accessed 2026-10-29). Exercise education media must stay non-clinical and match product copy rules.

**Video workflow for consistency:** Veo supports image-to-video and first/last frame ([Veo 3.1 capabilities](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate), accessed 2026-10-29). Generation pass should use start/end stills as reference frames with the shared video prompt.

### B. Runway Dev (`gen4_image_turbo` + `gen4_turbo`)

**Why short-listed:** One Dev billing account, native Runway image and video models for stylistic consistency, transparent credit pricing, and explicit commercial-use guidance for Dev.

**Cost per exercise:**

| Line                   | Source                                                                                  | Calculation                  |
| ---------------------- | --------------------------------------------------------------------------------------- | ---------------------------- |
| 2 x `gen4_image_turbo` | [Dev pricing guide](https://docs.dev.runwayml.com/guides/pricing/), accessed 2026-10-29 | 2 x 2 credits = 4 credits    |
| 1 x 6 s `gen4_turbo`   | [same](https://docs.dev.runwayml.com/guides/pricing/), accessed 2026-10-29              | 6 x 5 credits/s = 30 credits |
| Credits to USD         | [Dev pricing page](https://dev.runway.com/pricing), accessed 2026-10-29                 | 34 x $0.01 = **$0.34**       |

**Latency:** **Unverified** from public docs reviewed.

**Licence:** Commercial use of outputs not restricted subject to Terms and Usage Policy ([commercial use](https://dev.runway.com/learn/commercial-use), accessed 2026-10-29). IP indemnification requires Enterprise ([IP indemnification](https://dev.runway.com/learn/ip-indemnification), accessed 2026-10-29).

**Training / retention:** Enterprise no-training and zero retention ([Enterprise](https://dev.runway.com/enterprise), accessed 2026-10-29). Map account type before the generation pass.

**Anatomy:** No Runway Gen-4 entries in HumanScore ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). Treat joint-angle risk as **high until Kojo review**, per product direction.

### C. fal.ai (Seedream 4.5 + Kling 2.5 Turbo Pro)

**Why short-listed:** Single API and prepaid credits to trial strong third-party video (Kling) with HumanScore evidence, plus fixed-price Seedream stills, under fal's API no-training commitment on Client Content.

**Cost per exercise:**

| Line                                   | Source                                                                                                                                                                                                                                                                     | Calculation                                                                  |
| -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| 2 x Seedream 4.5 text-to-image         | [fal pricing](https://fal.ai/pricing), accessed 2026-10-29                                                                                                                                                                                                                 | 2 x $0.04 = **$0.08**                                                        |
| 1 x Kling 2.5 Turbo Pro image-to-video | [model llms.txt](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/llms.txt), accessed 2026-10-29                                                                                                                                                     | $0.35 for 5 s + $0.07/s additional                                           |
| **6 s target**                         | Spec wants 6 s loop ([exercise-requests spec](../../design/app/exercise-requests/spec.md)). Kling API documents duration options **5** and **10** only ([llms.txt](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/llms.txt), accessed 2026-10-29). | **Use 5 s for cost floor: $0.35.** Extrapolated 6 s: $0.42. **10 s: $0.70.** |
| **Total (5 s video)**                  |                                                                                                                                                                                                                                                                            | **$0.43**                                                                    |
| **Total (extrapolated 6 s)**           |                                                                                                                                                                                                                                                                            | **$0.50**                                                                    |

**Latency:** **Unverified.**

**Licence / training:** API Services s. 2.4 no training on Client Content ([API Services](https://fal.ai/legal/api-services), accessed 2026-10-29). Output IP warranties disclaimed ([Terms s. 4](https://fal.ai/terms), accessed 2026-10-29).

**Anatomy:** Kling 2.5 Turbo Pro HumanScore overall 90.8; kinematic leader among models benchmarked ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). Paper still reports biomechanical gaps vs real video ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29).

**Consistency:** Use generated start image as `image_url` and end image as `tail_image_url` when supported ([Kling llms.txt input schema](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/llms.txt), accessed 2026-10-29).

## Results table (empty, for generation pass)

Fill after manual generation. Times are wall-clock per exercise (all assets). Costs are actual billed amounts.

| Exercise                   | Candidate | Joint angle notes (Kojo) | Style consistency (1-5) | Time (min) | Cost (USD) |
| -------------------------- | --------- | ------------------------ | ----------------------- | ---------- | ---------- |
| Bridge                     | A. Google |                          |                         |            |            |
| Bridge                     | B. Runway |                          |                         |            |            |
| Bridge                     | C. fal    |                          |                         |            |            |
| Straight leg raise (rehab) | A. Google |                          |                         |            |            |
| Straight leg raise (rehab) | B. Runway |                          |                         |            |            |
| Straight leg raise (rehab) | C. fal    |                          |                         |            |            |
| Sit to stand               | A. Google |                          |                         |            |            |
| Sit to stand               | B. Runway |                          |                         |            |            |
| Sit to stand               | C. fal    |                          |                         |            |            |
| Band shoulder rotation     | A. Google |                          |                         |            |            |
| Band shoulder rotation     | B. Runway |                          |                         |            |            |
| Band shoulder rotation     | C. fal    |                          |                         |            |            |
| Heel slides                | A. Google |                          |                         |            |            |
| Heel slides                | B. Runway |                          |                         |            |            |
| Heel slides                | C. fal    |                          |                         |            |            |

## How generation will run (later pass, not in this PR)

1. **Trigger:** A manually dispatched GitHub Actions workflow on `main`, gated by a GitHub Environment (for example `media-generation`) with required reviewers including **Diadem**.
2. **Secrets:** Provider API keys only as environment secrets on that environment. No keys in the repo, local `.env`, or PR text. No local generation on engineer laptops.
3. **Scope:** Five exercises above, three candidates, shared prompts only (no patient data).
4. **Outputs:** Artifacts uploaded from the workflow run (or object storage configured in a later ticket), plus a human update to the results table in this doc or a sibling record.
5. **Review:** Kojo reviews joint angles and style consistency; Diadem reviews visual style alignment with design intent.
6. **This PR:** Does not add the workflow, scripts, or `.github` changes.

## Decision

**Proposed:** Run the generation pass as described, then **Diadem and Kojo** choose the visual style and provider pair based on the filled results table, joint-angle accuracy, style consistency across the five exercises, cost, and operational terms (retention, training, clinical-use restrictions).

**Acceptance:** After that choice, the **CTO** updates this record to **accepted** (or supersedes it with a narrower ADR for production defaults).

## Reasons for these three candidates

| Candidate  | Rationale                                                                                                                                                           |
| ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google     | Default enterprise path if Physio production already targets GCP; native 6 s Veo; published flat video price per generation.                                        |
| Runway Dev | Single vendor for matched Gen-4 image + video; clear credit math; strong Dev commercial-use documentation.                                                          |
| fal.ai     | Fastest way to evaluate Kling video with public biomechanics benchmark scores without a separate Kling enterprise contract; pairs with inexpensive Seedream stills. |

## Consequences

- Until the generation pass runs, **no provider is selected** and implementation must not hard-code model IDs in application code.
- **Unverified** items (latency, Runway Dev vs web training terms, exact Veo "count" billing, Kling 6 s duration on fal) must be confirmed during the generation pass or marked in the results table.
- If Google completes Imagen-to-Gemini image migration in the target project, update candidate A image endpoints before spend.

## References

- [DIDI-594 Product direction](https://linear.app/didi-build/issue/DIDI-594)
- [Exercise requests spec (media and five-exercise test)](../../design/app/exercise-requests/spec.md)
- [Exercise library spec (6 s loop, regenerate)](../../design/app/exercise-library/spec.md)
