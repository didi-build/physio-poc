# Exercise media generation and storage

Area: app · Backend services for [DIDI-1013](https://linear.app/didi-build/issue/DIDI-1013).

## Scope

- **Images only** (start and end stills). No video generation in this POC slice (product direction update on DIDI-594, Oct 30, 2026).
- **FLUX.2 klein 4B on fal** behind `ImageGenerationPort`; **fake image adapter by default** in tests and local wiring.
- **fal CDN downloads:** only `https` URLs on `fal.media` and subdomains (for example `v3b.fal.media`); `redirect: manual` with allowlisted redirect targets; 10 MiB size cap (`FAL_IMAGE_DOWNLOAD_MAX_BYTES` in `fal-flux-klein-image-generation.ts`).
- **Object storage** behind `MediaStoragePort` (draft vs public visibility). S3-compatible adapter for R2 lives under `src/adapters/node/`; Workers bindings and secrets are **DIDI-1040**.

## Layers

| Piece                                                          | Location                               |
| -------------------------------------------------------------- | -------------------------------------- |
| Prompt text (exercise fields only, shared style from ADR 0005) | `src/domain/exercise-media-prompts.ts` |
| `ImageGenerationPort`, `MediaStoragePort`                      | `src/storage/ports/`                   |
| Fake / prefix adapters                                         | `src/storage/adapters/memory/`         |
| fal FLUX adapter, S3-compatible object storage                 | `src/adapters/node/`                   |
| Regeneration cap, draft vs approved flows                      | `src/services/exercise-media/`         |
| SQL: `exercise_media_sets`, `media_regenerations`              | `migrations/0003_exercise_media.sql`   |

## Behaviour

1. **Initial draft media** is stored with `visibility = draft`. It is not returned from public-serving helpers until the version is approved and media is promoted.
2. **Regenerate on a draft** replaces the version’s media set (still draft).
3. **Regenerate on an approved exercise** (4A) creates a **new approved version** with public media immediately; prior versions remain in history.
4. **Daily cap:** five regenerations per practitioner per UTC day, enforced in `ExerciseMediaService` using `media_regenerations`.
5. **Regeneration note:** optional, max 200 characters, patient-detail checked. Sent to fal only (with `X-Fal-Store-IO: 0`). Never stored in D1, object storage, logs, errors, or version history text. `media_regenerations.had_note` records whether a note was present.

## Related

- ADR [0004](../decisions/0004-portable-runtime-and-storage-ports.md) (ports and platform import guard)
- ADR [0005](../decisions/0005-didi-999-exercise-media-style-and-model-test.md) (style prompt template)
- Design: `design/app/exercise-requests/spec.md`, `design/app/exercise-library/spec.md`
