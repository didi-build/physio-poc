# 0005. Exercise media visual style and model (five-exercise test)

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

End and video prompts reuse the same exercise-specific start text with the end or video `{POSE}` sentence swapped in (see start column below).

### Exact prompts per test exercise

| #   | Exercise                           | Start image prompt                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| --- | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Bridge                             | `Clinical physiotherapy exercise demonstration: bridge. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.`                          |
| 2   | Straight leg raise (rehab, supine) | `Clinical physiotherapy exercise demonstration: straight leg raise rehab supine. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.` |
| 3   | Sit to stand                       | `Clinical physiotherapy exercise demonstration: sit to stand. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.`                    |
| 4   | Band shoulder rotation             | `Clinical physiotherapy exercise demonstration: band shoulder external rotation. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.` |
| 5   | Heel slides                        | `Clinical physiotherapy exercise demonstration: heel slides supine. Single adult figure, androgynous, neutral skin tone, plain light grey studio background, soft even lighting. Clean 3D medical illustration style, teal accent on minimal athletic clothing, no text, no logos, no facial identity. Side or three-quarter view with unobstructed limbs and joints. Hold the starting position of the exercise, stable and anatomically neutral.`              |

## Candidate providers (desk research)

Three candidates cover **first-party cloud**, **Runway-native Dev API**, and **fal.ai as a multi-model gateway** (still one fixed image+video pair each for the test). Recommended model IDs for the generation pass are listed so every candidate uses one image model and one video model consistently.

### Summary comparison

|                                   | **A. Google Cloud Vertex AI**                                                                                                                                                                                                                                                                                                                                                | **B. Runway Dev (native models)**                                                                                                                                                                                                                                                                                                           | **C. fal.ai (hosted third-party models)**                                                                                                                                                                                                                                                                                                                                    |
| --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Image model                       | `gemini-2.5-flash-image` (replaces discontinued `imagen-4.0-generate-001`)                                                                                                                                                                                                                                                                                                   | `gen4_image` (text-only; `referenceImages` optional)                                                                                                                                                                                                                                                                                        | `fal-ai/bytedance/seedream/v4.5/text-to-image`                                                                                                                                                                                                                                                                                                                               |
| Video model                       | `veo-3.1-generate-001` (6 s, no audio)                                                                                                                                                                                                                                                                                                                                       | `gen4_turbo` (start frame only)                                                                                                                                                                                                                                                                                                             | `fal-ai/kling-video/v2.5-turbo/pro/image-to-video` (5 s or 10 s only; optional tail frame)                                                                                                                                                                                                                                                                                   |
| Est. cost / exercise (6 s video)  | **~$1.28** (see section A)                                                                                                                                                                                                                                                                                                                                                   | **$0.40** (40 credits)                                                                                                                                                                                                                                                                                                                      | **Not available** at 6 s; **$0.43** at 5 s or **$0.78** at 10 s (see section C)                                                                                                                                                                                                                                                                                              |
| Est. latency (desk research)      | Gemini image: higher latency than Imagen-class routes ([image overview](https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview), accessed 2026-10-29). Veo: long-running operation ([text-to-video doc](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-text), accessed 2026-10-29). **Wall-clock seconds: unverified.** | **Unverified**                                                                                                                                                                                                                                                                                                                              | Queue-based API; **wall-clock seconds: unverified**                                                                                                                                                                                                                                                                                                                          |
| Output ownership / commercial use | Generated Output is Customer Data; Google does not assert ownership ([Service Specific Terms, Generative AI Services](https://cloud.google.com/terms/service-terms), accessed 2026-10-29). Commercial use subject to Agreement and [Generative AI Prohibited Use Policy](https://policies.google.com/terms/generative-ai/use-policy), accessed 2026-10-29).                  | Runway Dev: does not restrict commercial use of outputs subject to Terms and Usage Policy ([commercial use](https://dev.runway.com/learn/commercial-use), accessed 2026-10-29). Runway does not claim output ownership ([same](https://dev.runway.com/learn/commercial-use), accessed 2026-10-29).                                          | Customer owns Customer Input; Output Content use must be lawful and non-infringing ([Terms of Service](https://fal.ai/terms), accessed 2026-10-29). fal does not warrant exclusive IP in outputs ([same](https://fal.ai/terms), accessed 2026-10-29).                                                                                                                        |
| Training on inputs                | Google will not train on Customer Data without permission ([Training Restriction](https://cloud.google.com/terms/service-terms), accessed 2026-10-29).                                                                                                                                                                                                                       | Pay-as-you-go: **contractual no-training on Enterprise** ([Enterprise](https://dev.runway.com/enterprise), accessed 2026-10-29). Self-serve Runway web Terms allow use of inputs/outputs to improve models ([Runway Terms of Use s. 4.4](https://runwayml.com/terms-of-use), accessed 2026-10-29); **Runway Dev API accounts: unverified**. | API Services s. 2.4: no training on Client Content **except** APIs marked "Pending Enterprise Ready" (Excluded Models); DPA does not apply to Excluded Models ([API Services s. 2.3-2.4](https://fal.ai/legal/api-services), accessed 2026-10-29). Terms s. 6: fal may use **Usage Data** to develop AI models ([Terms s. 6(c)](https://fal.ai/terms), accessed 2026-10-29). |
| Data retention                    | Prompts and Generated Output not stored outside Customer's Account longer than necessary to create output, absent permission ([Service Specific Terms s. 20(h)](https://cloud.google.com/terms/service-terms), accessed 2026-10-29).                                                                                                                                         | Enterprise: zero data retention supported ([Enterprise](https://dev.runway.com/enterprise), accessed 2026-10-29). Self-serve: **default retention: unverified**.                                                                                                                                                                            | Standard backup/archival retention may apply ([Terms s. 7.5](https://fal.ai/terms), accessed 2026-10-29). **Prompt/output retention duration: unverified** beyond confidentiality section.                                                                                                                                                                                   |
| Joint angle / anatomy (public)    | HumanScore benchmarked **Veo 3.1 Fast**, not `veo-3.1-generate-001`: overall **85.9** (anatomy avg **84.6**, kinematic avg **79.8**, kinetic avg **93.3**); bone-length sub-score (II) **90.8** ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). Gap vs real video remains.                                                                           | **Gen-4 Turbo / Gen-4 Image:** no HumanScore entry ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). General failure modes: unstable bone length, implausible joints, temporal jitter ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29).                                                         | **Kling 2.5 Turbo Pro** overall **90.8**; kinematic leader at **86.4** ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). Seedream: no HumanScore entry.                                                                                                                                                                                                |

### A. Google Cloud Vertex AI (`gemini-2.5-flash-image` + Veo 3.1)

**Why short-listed:** Single-vendor image and video on GCP, explicit 6 s Veo duration, enterprise terms, and public per-second Veo pricing.

**Image endpoint:** `imagen-4.0-generate-001` is listed as a **discontinued** endpoint; Google recommends `gemini-2.5-flash-image` instead, with a migration deadline of 2026-06-30 that has already passed ([image overview](https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview), accessed 2026-10-29). Candidate A uses **`gemini-2.5-flash-image`** for the test.

**Cost per exercise (2 images at 1024x1024 + 1 x 6 s video, 720p, video without audio):**

| Line                               | Source                                                                                                                                                      | Calculation                                            |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| 2 x image output                   | [Agent Platform pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing) footnote \*\*\*, accessed 2026-10-29              | 2 x **$0.039** per 1024x1024 output image = **$0.078** |
| 1 x 6 s Veo 3.1 video (video only) | [Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing) Veo 3.1 video generation 720p/1080p **$0.20 per second**, accessed 2026-10-29 | 6 x $0.20 = **$1.20**                                  |
| **Total**                          |                                                                                                                                                             | **~$1.28** per exercise (6 s video)                    |

The English Agent Platform table also lists "$0.20 / 1 count" for Veo 3.1 video without defining "count" ([Agent Platform pricing](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing), accessed 2026-10-29). The same page states that **video media input is charged per second** ([same page](https://cloud.google.com/gemini-enterprise-agent-platform/generative-ai/pricing), accessed 2026-10-29), and the Vertex AI pricing page expresses Veo 3.1 video-only generation as **$0.20 per output second** at 720p/1080p ([Vertex AI pricing](https://cloud.google.com/vertex-ai/generative-ai/pricing), accessed 2026-10-29). **Do not use a flat $0.28 per exercise** unless a future invoice defines a flat per-generation count.

**Latency:** Gemini image routes are described as higher latency than legacy Imagen-class routes in the overview comparison ([image overview](https://cloud.google.com/vertex-ai/generative-ai/docs/image/overview), accessed 2026-10-29). Veo uses long-running operations ([generate videos from text](https://docs.cloud.google.com/vertex-ai/generative-ai/docs/video/generate-videos-from-text), accessed 2026-10-29). End-to-end wall-clock time: **unverified.**

**Licence and restrictions:** Generated Output is Customer Data; Google disclaims accuracy and restricts clinical use of Generative AI Services as substitute for professional medical advice ([Service Specific Terms s. 20](https://cloud.google.com/terms/service-terms), accessed 2026-10-29). Exercise education media must stay non-clinical and match product copy rules.

**Video workflow for consistency:** Veo supports image-to-video and first/last frame ([Veo 3.1 capabilities](https://docs.cloud.google.com/gemini-enterprise-agent-platform/models/veo/3-1-generate), accessed 2026-10-29). Use start/end stills as reference frames with the shared video prompt.

**HumanScore note:** The public leaderboard evaluates **Veo 3.1 Fast**, not the standard `veo-3.1-generate-001` model proposed here ([HumanScore Table 1](https://arxiv.org/html/2604.20157), accessed 2026-10-29).

### B. Runway Dev (`gen4_image` + `gen4_turbo`)

**Why short-listed:** One Dev billing account, native Runway image and video models, transparent credit pricing, and explicit Dev commercial-use guidance.

**Prompt compatibility:** `gen4_image_turbo` requires at least one `referenceImages` entry ([Runway API reference](https://docs.dev.runwayml.com/api.md), accessed 2026-10-29), which breaks the shared text-only prompt. **`gen4_image`** allows optional reference images and accepts text-only prompts ([same API reference](https://docs.dev.runwayml.com/api.md), accessed 2026-10-29).

**Cost per exercise:**

| Line                 | Source                                                                                  | Calculation                  |
| -------------------- | --------------------------------------------------------------------------------------- | ---------------------------- |
| 2 x `gen4_image`     | [Dev pricing guide](https://docs.dev.runwayml.com/guides/pricing/), accessed 2026-10-29 | 2 x 5 credits = 10 credits   |
| 1 x 6 s `gen4_turbo` | [same](https://docs.dev.runwayml.com/guides/pricing/), accessed 2026-10-29              | 6 x 5 credits/s = 30 credits |
| Credits to USD       | [Dev pricing page](https://dev.runway.com/pricing), accessed 2026-10-29                 | 40 x $0.01 = **$0.40**       |

**Latency:** **Unverified.**

**Licence:** Commercial use of outputs not restricted subject to Terms and Usage Policy ([commercial use](https://dev.runway.com/learn/commercial-use), accessed 2026-10-29). IP indemnification requires Enterprise ([IP indemnification](https://dev.runway.com/learn/ip-indemnification), accessed 2026-10-29).

**Training / retention:** Enterprise no-training and zero retention ([Enterprise](https://dev.runway.com/enterprise), accessed 2026-10-29). Map account type before the generation pass.

**Consistency:** `gen4_turbo` image-to-video accepts a **start frame only** (`position` first); it does not take an end frame like Veo first/last frame or Kling `tail_image_url` ([Runway API reference](https://docs.dev.runwayml.com/api.md), accessed 2026-10-29). `duration` supports 2 to 10 seconds, so **6 s is supported** ([same](https://docs.dev.runwayml.com/api.md), accessed 2026-10-29).

**Anatomy:** No Runway Gen-4 entries in HumanScore ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). Treat joint-angle risk as **high until Kojo review**, per product direction.

### C. fal.ai (Seedream 4.5 + Kling 2.5 Turbo Pro)

**Why short-listed:** Single API and prepaid credits to trial Kling video with HumanScore evidence, plus fixed-price Seedream stills, under fal's API no-training commitment on Client Content (subject to Excluded Models).

**Cost per exercise (2 images + 1 video; product spec targets 6 s loop):**

| Line                                   | Source                                                                                                                                                                                                                          | Calculation                                                        |
| -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| 2 x Seedream 4.5 text-to-image         | [fal pricing.md](https://fal.ai/pricing.md), accessed 2026-10-29                                                                                                                                                                | 2 x $0.04 = **$0.08**                                              |
| 1 x Kling 2.5 Turbo Pro image-to-video | [model llms.txt](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/llms.txt), accessed 2026-10-29: **$0.35 for 5 s**, **$0.07 per additional second**; `duration` options **5** or **10** only             | 5 s video: **$0.35**; 10 s video: $0.35 + (5 x $0.07) = **$0.70**  |
| **Total at 5 s video**                 |                                                                                                                                                                                                                                 | $0.08 + $0.35 = **$0.43**                                          |
| **Total at 10 s video**                |                                                                                                                                                                                                                                 | $0.08 + $0.70 = **$0.78**                                          |
| **6 s spec**                           | [exercise-requests spec](../../design/app/exercise-requests/spec.md) (6 s loop); Kling API has no 6 s option ([llms.txt](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/llms.txt), accessed 2026-10-29) | **Mismatch:** pick 5 s or 10 s for the test and record for Diadem. |

**Latency:** **Unverified.**

**Licence / training:** API Services s. 2.4 no training on Client Content, excluding "Pending Enterprise Ready" models ([API Services s. 2.4](https://fal.ai/legal/api-services), accessed 2026-10-29). Third-party upstream terms may differ ([s. 2.3](https://fal.ai/legal/api-services), accessed 2026-10-29). Terms s. 6(c): Usage Data may be used to develop fal AI models ([Terms](https://fal.ai/terms), accessed 2026-10-29). Confirm in the generation pass that Seedream and Kling endpoints are not Excluded Models.

**Anatomy:** Kling 2.5 Turbo Pro HumanScore overall 90.8; kinematic leader at 86.4 ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29). Biomechanical gaps vs real video remain ([HumanScore](https://arxiv.org/html/2604.20157), accessed 2026-10-29).

**Consistency:** Use generated start image as `image_url` and end image as `tail_image_url` when supported ([Kling llms.txt](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/llms.txt), accessed 2026-10-29).

## Results table (empty, for generation pass)

Fill after manual generation. Record wall-clock latency per exercise (all assets). Costs are actual billed amounts.

| Exercise                   | Candidate | Joint angle notes (Kojo) | Style consistency (1-5) | Latency (s) | Time (min) | Cost (USD) |
| -------------------------- | --------- | ------------------------ | ----------------------- | ----------- | ---------- | ---------- |
| Bridge                     | A. Google |                          |                         |             |            |            |
| Bridge                     | B. Runway |                          |                         |             |            |            |
| Bridge                     | C. fal    |                          |                         |             |            |            |
| Straight leg raise (rehab) | A. Google |                          |                         |             |            |            |
| Straight leg raise (rehab) | B. Runway |                          |                         |             |            |            |
| Straight leg raise (rehab) | C. fal    |                          |                         |             |            |            |
| Sit to stand               | A. Google |                          |                         |             |            |            |
| Sit to stand               | B. Runway |                          |                         |             |            |            |
| Sit to stand               | C. fal    |                          |                         |             |            |            |
| Band shoulder rotation     | A. Google |                          |                         |             |            |            |
| Band shoulder rotation     | B. Runway |                          |                         |             |            |            |
| Band shoulder rotation     | C. fal    |                          |                         |             |            |            |
| Heel slides                | A. Google |                          |                         |             |            |            |
| Heel slides                | B. Runway |                          |                         |             |            |            |
| Heel slides                | C. fal    |                          |                         |             |            |            |

## How generation will run (later pass, not in this PR)

1. **Trigger:** A manually dispatched GitHub Actions workflow on `main`, gated by a GitHub Environment (for example `media-generation`) with required reviewers including **Diadem**.
2. **Secrets:** Provider API keys only as environment secrets on that environment. No keys in the repo, local `.env`, or PR text. No local generation on engineer laptops. Secret **names** are documented in the Ready for maintainer ticket once providers are picked (CTO ruling on DIDI-999, 2026-10-29).
3. **Scope:** Five exercises above, three candidates, shared prompts only (no patient data).
4. **Outputs:** Artifacts uploaded from the workflow run (or object storage configured in a later ticket), plus a human update to the results table in this doc or a sibling record.
5. **Review:** Kojo reviews joint angles and style consistency; Diadem reviews visual style alignment with design intent.
6. **This PR:** Does not add the workflow, scripts, or `.github` changes.
7. **Workflow PR gate:** The real workflow PR needs **CTO head-pinned sign-off** before QA merges it (per DIDI-999 process).

## Decision

**Proposed:** Run the generation pass as described, then **Diadem and Kojo** choose the visual style and provider pair based on the filled results table, joint-angle accuracy, style consistency across the five exercises, cost, and operational terms (retention, training, clinical-use restrictions).

**Acceptance:** After that choice, the **CTO** updates this record to **accepted** (or supersedes it with a narrower ADR for production defaults).

## Reasons for these three candidates

| Candidate  | Rationale                                                                                                                                          |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| Google     | Default enterprise path if Physio production targets GCP; native 6 s Veo; public **per-second** Veo pricing on Vertex AI.                          |
| Runway Dev | Single vendor for matched Gen-4 image + video; text-only `gen4_image`; clear credit math; strong Dev commercial-use documentation.                 |
| fal.ai     | Evaluate Kling video with public HumanScore scores without a separate Kling contract; inexpensive Seedream stills; single API and prepaid credits. |

## Consequences

- Until the generation pass runs, **no provider is selected** and implementation must not hard-code model IDs in application code.
- **Unverified** items (wall-clock latency, Runway Dev vs web training terms, fal endpoint Excluded Model status) must be confirmed during the generation pass or marked in the results table.
- **Kling on fal does not support 6 s** per API docs; resolve 5 s vs 10 s vs spec change with Diadem before production ([Kling llms.txt](https://fal.ai/models/fal-ai/kling-video/v2.5-turbo/pro/image-to-video/llms.txt), accessed 2026-10-29).
- HumanScore scores for **Veo 3.1 Fast** do not directly validate **`veo-3.1-generate-001`**.

## References

- [DIDI-594 Product direction](https://linear.app/didi-build/issue/DIDI-594)
- [Exercise requests spec (media and five-exercise test)](../../design/app/exercise-requests/spec.md)
- [Exercise library spec (6 s loop, regenerate)](../../design/app/exercise-library/spec.md)
