# Exercise media generation and storage

Area: app · Backend services for [DIDI-1013](https://linear.app/didi-build/issue/DIDI-1013).

## Scope

- **Images only** (start and end stills). No video generation in this POC slice (product direction update on DIDI-594, Oct 30, 2026).
- **FLUX.2 klein 4B on DeepInfra** behind `ImageGenerationPort` when `PHYSIO_DEEPINFRA_API_KEY` is set; **fake image adapter by default** in tests and local wiring (ADR [0010](../decisions/0010-didi-1209-deepinfra-production-image-provider.md)).
- **Responses:** base64 PNG from DeepInfra OpenAI-compatible image APIs; no provider CDN URL stored on the port.
- **Object storage** behind `MediaStoragePort` (draft vs public visibility). Production Worker uses `R2ObjectStorage` when `PHYSIO_MEDIA` is bound (**DIDI-1040**); local dev and tests use in-memory fakes.
- **HTTP:** exercise media routes use `handleExerciseMediaRequest` through `AppDependencies.extraRouteHandlers` on the Node entry when `NODE_ENV` is `development` or `test`, on the production Worker entry via `create-worker-production-app-dependencies.ts`, and through the test harness helper `exerciseMediaExtraRouteHandlers()`.

## Layers

| Piece                                                           | Location                                                            |
| --------------------------------------------------------------- | ------------------------------------------------------------------- |
| Prompt text (exercise fields only, shared style from ADR 0005)  | `src/domain/exercise-media-prompts.ts`                              |
| `ImageGenerationPort`, `MediaStoragePort`                       | `src/storage/ports/`                                                |
| Fake / prefix adapters                                          | `src/storage/adapters/memory/`                                      |
| DeepInfra FLUX adapter                                          | `src/adapters/node/deepinfra-flux-klein-image-generation.ts`        |
| Regeneration cap, draft vs approved flows, dev-only HTTP routes | `src/services/exercise-media/`, `src/http/routes/exercise-media.ts` |
| SQL: `exercise_media_sets`, `media_regenerations`               | `migrations/0003_exercise_media.sql`                                |

## Behaviour

1. **Initial draft media** is stored with `visibility = draft`. It is not returned from public-serving helpers until the version is approved and media is promoted.
2. **Regenerate on a draft** replaces the version’s media set (still draft).
3. **Regenerate on an approved exercise** stores **private draft** media on `pending_media_set_id`; live `media_set_id` and share links stay untouched until confirm ([DIDI-1261](https://linear.app/didi-build/issue/DIDI-1261)).
4. **Daily cap:** five regenerations per practitioner per UTC day. `ExerciseMediaService` consumes a slot with one conditional `INSERT … SELECT` (`media-regeneration-daily-cap.ts`) so the cap check and audit insert are atomic under parallel requests; failed image work refunds the row.
5. **Regeneration note:** optional, max 200 characters, patient-detail checked. Sent to the image provider only inside the prompt. Never stored in D1, object storage, logs, errors, or version history text. `media_regenerations.had_note` records whether a note was present.

## Related

- ADR [0004](../decisions/0004-portable-runtime-and-storage-ports.md) (ports and platform import guard)
- ADR [0005](../decisions/0005-didi-999-exercise-media-style-and-model-test.md) (style prompt template)
- Design: `design/app/exercise-requests/spec.md`, `design/app/exercise-library/spec.md`
