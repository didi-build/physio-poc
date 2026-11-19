# DIDI-1212 mutant evidence

Head: `a3eddf4dcb4e5ccdeea1bfa651c7086addf28414`

Baseline (serial `npm run test -- --maxWorkers=1`): **Test Files** 286 passed (286); **Tests** 2880 passed | 4 skipped (2884); exit **0**.

| ID | Mutant site | Exit | Failed | Passed | Skipped | vs baseline (failed/passed) | Error kind | Status |
|----|-------------|------|--------|--------|---------|-----------------------------|------------|--------|
| M1 | create-worker-production-app-dependencies.ts: extraRouteHandlers cleared (route not registered on Worker) | 1 | 5 | 2875 | 4 | 0 / 2880 → 5 / 2875 | test_failure | Killed |
| M2 | require-practitioner.ts: session guard returns bypass token instead of 401 | 1 | 4 | 2876 | 4 | 0 / 2880 → 4 / 2876 | test_failure | Killed |
| S01 | create-worker-production-app-dependencies.ts: extraSessionPublicPath opens quota GET without session | 0 | 0 | 2880 | 4 | 0 / 2880 → 0 / 2880 | survivor | Survived |
| S02 | create-worker-production-app-dependencies.ts: extraSessionPublicPath opens all exercise media routes without session | 0 | 0 | 2880 | 4 | 0 / 2880 → 0 / 2880 | survivor | Survived |
| M3 | exercise-media-service.ts: owner check removed (exercise_created_by !== practitionerId) | 1 | 13 | 2867 | 4 | 0 / 2880 → 13 / 2867 | test_failure | Killed |
| M4 | create-image-generation-port.ts: fake chosen when PHYSIO_DEEPINFRA_API_KEY present (if (!apiKey)) | 1 | 34 | 2846 | 4 | 0 / 2880 → 34 / 2846 | test_failure | Killed |
| M5 | create-image-generation-port.ts: DeepInfra chosen when key absent (if (true)) | 1 | 32 | 2848 | 4 | 0 / 2880 → 32 / 2848 | test_failure | Killed |
| M6 | create-worker-production-app-dependencies.ts: InMemoryObjectStorage kept in prod | 1 | 3 | 2877 | 4 | 0 / 2880 → 3 / 2877 | test_failure | Killed |
| M7 | .github/workflows/ci.yml: PHYSIO_DEEPINFRA_API_KEY on PR CI check job | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| M8 | .github/workflows/deploy-physio-mcp-worker.yml: PHYSIO_DEEPINFRA_API_KEY removed from gated Put step | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| M9 | exercise-media.ts: key leaked into ImageGenerationError JSON response | 1 | 2 | 2878 | 4 | 0 / 2880 → 2 / 2878 | test_failure | Killed |
| L02 | exercise-media.ts: 502 ImageGenerationError body includes upstream message | 1 | 7 | 2873 | 4 | 0 / 2880 → 7 / 2873 | test_failure | Killed |
| L03 | deepinfra-flux-klein-image-generation.ts: apiKey logged on HTTP request failure | 1 | 7 | 2873 | 4 | 0 / 2880 → 7 / 2873 | test_failure | Killed |
| K09 | deploy-physio-mcp-worker.yml: deploy job environment not production | 1 | 2 | 2878 | 4 | 0 / 2880 → 2 / 2878 | test_failure | Killed |
| K11 | deploy-physio-mcp-worker.yml: PHYSIO_DEEPINFRA_API_KEY on non-Put step | 0 | 0 | 0 | 0 | 0 / 2880 → 0 / 0 | no-op | Survived (no-op) |
| M11 | exercise-media.ts: no-store removed from SERVE_JSON_HEADERS | 1 | 3 | 2877 | 4 | 0 / 2880 → 3 / 2877 | test_failure | Killed |
| B1D | deepinfra-flux-klein-image-generation.ts: restore ?? fetch (unbound) | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| B1F | fal-flux-klein-image-generation.ts: restore ?? fetch (unbound) | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| Q1A | exercise-media.ts: wrong 409 error code string | 1 | 4 | 2876 | 4 | 0 / 2880 → 4 / 2876 | test_failure | Killed |
| Q1B | exercise-media.ts: 409 → 400 for already generated | 1 | 4 | 2876 | 4 | 0 / 2880 → 4 / 2876 | test_failure | Killed |
| Q1C | exercise-media-service.ts: generate skips cap increment | 1 | 4 | 2876 | 4 | 0 / 2880 → 4 / 2876 | test_failure | Killed |
| Q2A | bounded-json-request-body.ts: remove Content-Length precheck | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| Q2B | bounded-json-request-body.ts: reject at cap (>=) | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| Q2C | bounded-json-request-body.ts: skip bounded read (arrayBuffer) | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| P1 | persistApprovedPendingMediaSet writes public object visibility (approved generate/regenerate) | 1 | 2 | 2878 | 4 | 0 / 2880 → 2 / 2878 | test_failure | Killed |
| P2 | persistApprovedPendingMediaSet inserts public exercise_media_sets row | 1 | 2 | 2878 | 4 | 0 / 2880 → 2 / 2878 | test_failure | Killed |
| P3 | getMediaForServing internal serves pending_media_set_id without owner gate | 1 | 2 | 2878 | 4 | 0 / 2880 → 2 / 2878 | test_failure | Killed |
| P4 | exercise-media serve JSON drops Cache-Control no-store | 1 | 3 | 2877 | 4 | 0 / 2880 → 3 / 2877 | test_failure | Killed |
| C6R1 | exercise-media-service.ts: pending internal serve skips requester match | 1 | 2 | 2878 | 4 | 0 / 2880 → 2 / 2878 | test_failure | Killed |
| C6R2 | exercise-media-service.ts: approved regenerate skips pending requester gate | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| C6R3 | exercise-media-service.ts: replace pending without deleting old draft objects | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| C6R4 | exercise-media-service.ts: public serve prefers pending_media_set_id | 1 | 4 | 2876 | 4 | 0 / 2880 → 4 / 2876 | test_failure | Killed |
| C6R5 | exercise-media-service.ts: generate allowed when pending already exists | 1 | 1 | 2879 | 4 | 0 / 2880 → 1 / 2879 | test_failure | Killed |
| C6R6 | exercise-media-service.ts: approved pending persist also updates live media_set_id | 1 | 5 | 2875 | 4 | 0 / 2880 → 5 / 2875 | test_failure | Killed |

## Killing tests (full vitest names)

### M1

- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only generate for another practitioner's draft on production Worker deps
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only internal serve for another practitioner's draft
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only regenerate for another practitioner's draft
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > reaches the exercise media handler when authenticated (version_not_found, not app not_found)
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > registers exercise media routes and image port on production deps

### M2

- test/didi-1225-routine-similar-http.test.ts > DIDI-1225 routine similar HTTP (integration) > handleRoutinesRequest rejects null session before scoring
- test/exercise-library-null-session-direct.test.ts > handleExerciseLibraryRequest null session (direct, integration) > returns 401 on each route with null session and performs no writes
- test/exercise-media-practitioner-access.test.ts > Exercise media practitioner auth (integration) > returns 401 unauthorized from handleExerciseMediaRequest without sessionPractitioner on quota, generate and regenerate
- test/exercise-requests-http.test.ts > Exercise requests HTTP routes (integration) > returns 401 from the exercise-requests handler when the session is missing

### S01

(none)

### S02

(none)

### M3

- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > GET internal serve: approver A on B-owned approved matches missing version response
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > GET internal serve: practitioner A on B approved matches missing version response
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST generate: approver A on B-owned approved matches missing version response
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST generate: practitioner A on B approved matches missing version response
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST regenerate: approver A on B-owned approved matches missing version response
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST regenerate: practitioner A on B approved matches missing version response
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner draft access (integration) > GET internal serve: practitioner A on B draft matches missing version response
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner draft access (integration) > POST generate: practitioner A on B draft matches missing version response
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner draft access (integration) > POST regenerate: practitioner A on B draft matches missing version response
- test/exercise-media-service.test.ts > ExerciseMediaService (integration) > rejects owner-only internal serve and mutations when practitioner id is missing on an approved version owned by another practitioner
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only generate for another practitioner's draft on production Worker deps
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only internal serve for another practitioner's draft
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only regenerate for another practitioner's draft

### M4

- test/adapters-node-deepinfra.test.ts > createImageGenerationPort (unit) > returns DeepInfraFluxKleinImageGeneration when PHYSIO_DEEPINFRA_API_KEY is set
- test/adapters-node-deepinfra.test.ts > createImageGenerationPort (unit) > returns FakeImageGeneration when PHYSIO_DEEPINFRA_API_KEY is missing or blank
- test/r2-production-wiring.test.ts > Production R2 object storage wiring (DIDI-1040) > persists and reads bytes through production deps PHYSIO_MEDIA
- test/worker-api-session-resolution-once.test.ts > Worker /api session resolution once per request (DIDI-1187) > calls better-auth getSession once and two practitioner SQL reads for a protected worker route
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > accepts a D1 binding bridged from sqlite for Better Auth tables
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > ignores stray AUTH_BASE_URL in Worker env for issuer and trusted origin via worker.fetch
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > never uses FakeAuthPort even when PHYSIO_USE_FAKE_GOOGLE_PROVIDER=true in env
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > returns 401 for MCP without a session when production auth is wired
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > reuses the same production deps within an isolate when env is unchanged
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > routes production auth through worker.fetch with Google authorize URL
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > uses BetterAuthPort when every production auth env value is present
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > builds DeepInfraFluxKleinImageGeneration when PHYSIO_DEEPINFRA_API_KEY is set on production deps
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > builds FakeImageGeneration when PHYSIO_DEEPINFRA_API_KEY is absent on production deps
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only generate for another practitioner's draft on production Worker deps
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only internal serve for another practitioner's draft
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only regenerate for another practitioner's draft
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > reaches the exercise media handler when authenticated (version_not_found, not app not_found)
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > registers exercise media routes and image port on production deps
- test/worker-health-first-auth-stall.test.ts > Worker health-first better-auth stall regression (DIDI-1187 M3) > answers /api/auth/ok within 2s after /health in a fresh isolate
- test/worker-production-auth-wiring.test.ts > Worker production auth wiring (AC2, DIDI-1153) > accepts a signed MCP bearer token when the Better Auth session is active
- test/worker-production-auth-wiring.test.ts > Worker production auth wiring (AC2, DIDI-1153) > rejects invalid callbackURL on Worker production deps
- test/worker-production-auth-wiring.test.ts > Worker production auth wiring (AC2, DIDI-1153) > returns MCP bearer challenge on Worker production deps
- test/worker-production-deps-stall.test.ts > Worker production deps init (DIDI-1187) > lets concurrent cold-start callers share one in-flight setup and finish within a timeout
- test/worker-production-deps-stall.test.ts > Worker production deps init (DIDI-1187) > serves concurrent worker.fetch auth probes while production deps setup is in flight
- test/worker-production-physio-media-binding.test.ts > Worker production PHYSIO_MEDIA binding (DIDI-1040) > missing PHYSIO_MEDIA keeps auth and non-media routes up; published link media 404s via storage stub
- test/worker-production-setup-wait-until.test.ts > Worker production setup waitUntil (DIDI-1187 M2) > registers waitUntil while production setup is still in flight
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET / serves index.html with cache-control no-cache
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /assets/<hashed file> returns the asset from ASSETS
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /mcp without session still returns 401 bearer challenge
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /sign-in returns 200 text/html SPA shell when ASSETS is wired
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > unauthenticated GET / redirects to /sign-in?returnTo=%2F
- test/worker-public-share-link-media-didi-1191.test.ts > Worker public share link media (DIDI-1191) > serves end-phase bytes on the Worker entry
- test/worker-public-share-link-media-didi-1191.test.ts > Worker public share link media (DIDI-1191) > serves link-scoped media bytes on the Worker entry without a session
- test/worker-public-share-link-media-didi-1191.test.ts > Worker public share link media via R2 production wiring (DIDI-1040) > serves bytes from PHYSIO_MEDIA without substituting in-memory objects

### M5

- test/adapters-node-deepinfra.test.ts > createImageGenerationPort (unit) > returns FakeImageGeneration when PHYSIO_DEEPINFRA_API_KEY is missing or blank
- test/r2-production-wiring.test.ts > Production R2 object storage wiring (DIDI-1040) > persists and reads bytes through production deps PHYSIO_MEDIA
- test/worker-api-session-resolution-once.test.ts > Worker /api session resolution once per request (DIDI-1187) > calls better-auth getSession once and two practitioner SQL reads for a protected worker route
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > accepts a D1 binding bridged from sqlite for Better Auth tables
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > ignores stray AUTH_BASE_URL in Worker env for issuer and trusted origin via worker.fetch
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > never uses FakeAuthPort even when PHYSIO_USE_FAKE_GOOGLE_PROVIDER=true in env
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > returns 401 for MCP without a session when production auth is wired
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > reuses the same production deps within an isolate when env is unchanged
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > routes production auth through worker.fetch with Google authorize URL
- test/worker-entry-production-auth.test.ts > Worker entry production auth (DIDI-1153) > uses BetterAuthPort when every production auth env value is present
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > builds FakeImageGeneration when PHYSIO_DEEPINFRA_API_KEY is absent on production deps
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only generate for another practitioner's draft on production Worker deps
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only internal serve for another practitioner's draft
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > enforces owner-only regenerate for another practitioner's draft
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > reaches the exercise media handler when authenticated (version_not_found, not app not_found)
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > registers exercise media routes and image port on production deps
- test/worker-health-first-auth-stall.test.ts > Worker health-first better-auth stall regression (DIDI-1187 M3) > answers /api/auth/ok within 2s after /health in a fresh isolate
- test/worker-production-auth-wiring.test.ts > Worker production auth wiring (AC2, DIDI-1153) > accepts a signed MCP bearer token when the Better Auth session is active
- test/worker-production-auth-wiring.test.ts > Worker production auth wiring (AC2, DIDI-1153) > rejects invalid callbackURL on Worker production deps
- test/worker-production-auth-wiring.test.ts > Worker production auth wiring (AC2, DIDI-1153) > returns MCP bearer challenge on Worker production deps
- test/worker-production-deps-stall.test.ts > Worker production deps init (DIDI-1187) > lets concurrent cold-start callers share one in-flight setup and finish within a timeout
- test/worker-production-deps-stall.test.ts > Worker production deps init (DIDI-1187) > serves concurrent worker.fetch auth probes while production deps setup is in flight
- test/worker-production-physio-media-binding.test.ts > Worker production PHYSIO_MEDIA binding (DIDI-1040) > missing PHYSIO_MEDIA keeps auth and non-media routes up; published link media 404s via storage stub
- test/worker-production-setup-wait-until.test.ts > Worker production setup waitUntil (DIDI-1187 M2) > registers waitUntil while production setup is still in flight
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET / serves index.html with cache-control no-cache
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /assets/<hashed file> returns the asset from ASSETS
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /mcp without session still returns 401 bearer challenge
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > GET /sign-in returns 200 text/html SPA shell when ASSETS is wired
- test/worker-production-ui-static.test.ts > Worker production UI static (DIDI-1169) > unauthenticated GET / redirects to /sign-in?returnTo=%2F
- test/worker-public-share-link-media-didi-1191.test.ts > Worker public share link media (DIDI-1191) > serves end-phase bytes on the Worker entry
- test/worker-public-share-link-media-didi-1191.test.ts > Worker public share link media (DIDI-1191) > serves link-scoped media bytes on the Worker entry without a session
- test/worker-public-share-link-media-didi-1191.test.ts > Worker public share link media via R2 production wiring (DIDI-1040) > serves bytes from PHYSIO_MEDIA without substituting in-memory objects

### M6

- test/r2-production-wiring.test.ts > Production R2 object storage wiring (DIDI-1040) > persists and reads bytes through production deps PHYSIO_MEDIA
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > registers exercise media routes and image port on production deps
- test/worker-public-share-link-media-didi-1191.test.ts > Worker public share link media via R2 production wiring (DIDI-1040) > serves bytes from PHYSIO_MEDIA without substituting in-memory objects

### M7

- test/worker-production-deepinfra-deploy.test.ts > PHYSIO_DEEPINFRA_API_KEY production deploy wiring (DIDI-1212) > keeps PHYSIO_DEEPINFRA_API_KEY out of non-deploy workflow files

### M8

- test/worker-production-deepinfra-deploy.test.ts > PHYSIO_DEEPINFRA_API_KEY production deploy wiring (DIDI-1212) > pins gated deploy production environment and PHYSIO_DEEPINFRA_API_KEY on Put from production secrets

### M9

- test/portable-runtime-import-guard.test.ts > portable runtime import guard (unit) > finds no violations in the repository portable tree
- test/worker-production-process-env-guard.test.ts > Worker production process guard (DIDI-1164) > finds no process usage in the Worker production entry graph

### L02

- test/adapters-node-deepinfra-qa-r1.test.ts > DeepInfra HTTP route QA round 1 > JSON null payload through route: 502 image_generation_response_invalid
- test/adapters-node-deepinfra-qa-r1.test.ts > DeepInfra HTTP route QA round 1 > end-only edit failure returns code-only 502 through the route
- test/adapters-node-deepinfra-qa-r1.test.ts > DeepInfra HTTP route QA round 1 > missing image field through route: 502 image_generation_response_invalid for {"data":[]}
- test/adapters-node-deepinfra-qa-r1.test.ts > DeepInfra HTTP route QA round 1 > missing image field through route: 502 image_generation_response_invalid for {}
- test/adapters-node-deepinfra-qa-r1.test.ts > DeepInfra HTTP route QA round 1 > returns code-only 502 body for image_generation_network_failed
- test/adapters-node-deepinfra-qa-r1.test.ts > DeepInfra HTTP route QA round 1 > returns code-only 502 body for image_generation_request_failed
- test/adapters-node-deepinfra-qa-r1.test.ts > DeepInfra HTTP route QA round 1 > returns code-only 502 body for image_generation_response_invalid

### L03

- test/adapters-node-deepinfra.test.ts > DeepInfraFluxKleinImageGeneration (unit, mocked fetch) > does not include provider bodies, API keys, or regeneration notes in thrown errors
- test/adapters-node-deepinfra.test.ts > DeepInfraFluxKleinImageGeneration (unit, mocked fetch) > does not leak served edit-path bodies on 429, 5xx, or invalid JSON
- test/adapters-node-deepinfra.test.ts > DeepInfraFluxKleinImageGeneration (unit, mocked fetch) > does not leak the sentinel key on 429 and 5xx generation failures
- test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > does not echo DeepInfra response bodies or regeneration notes in API errors
- test/exercise-media-qa-round3.test.ts > Exercise media QA round 3 (integration, mocked DeepInfra) > does not leak the regeneration note when DeepInfra edit returns 401
- test/exercise-media-qa-round3.test.ts > Exercise media QA round 3 (integration, mocked DeepInfra) > does not leak the regeneration note when DeepInfra edit returns 403
- test/worker-exercise-media-production.test.ts > Worker production exercise media (DIDI-1212) > does not leak PHYSIO_DEEPINFRA_API_KEY in console output or the err.cause chain when DeepInfra fetch fails

### K09

- test/d1-binding-production-deploy.test.ts > production deploy workflow (DIDI-1031) > requires the exact main-branch guard on the deploy job
- test/worker-production-deepinfra-deploy.test.ts > PHYSIO_DEEPINFRA_API_KEY production deploy wiring (DIDI-1212) > pins gated deploy production environment and PHYSIO_DEEPINFRA_API_KEY on Put from production secrets

### K11

(none)

### M11

- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > serves pending draft only to the owner with Cache-Control no-store
- test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > generates draft media and blocks public serving until approved
- test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > returns 400 invalid_input when access is missing or not public or internal

### B1D

- test/adapters-node-deepinfra.test.ts > DeepInfra global fetch binding (Worker B1) > calls upstream through globalThis-bound fetch when fetchImpl is omitted

### B1F

- test/adapters-node-fal-fetch-binding.test.ts > Fal global fetch binding (B1) > calls upstream through globalThis-bound fetch when fetchImpl is omitted

### Q1A

- test/exercise-media-didi-1212-qa.test.ts > exercise media DIDI-1212 QA (Q1 generate cap, Q2 body size) > returns 409 with pinned body on second generate with zero upstream calls
- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > returns 409 with zero upstream calls when only pending media exists
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST generate: exercise owner B gets 409 when B approved version already has media
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > owner B succeeds on regenerate and internal when approver is A (generate 409 if media exists)

### Q1B

- test/exercise-media-didi-1212-qa.test.ts > exercise media DIDI-1212 QA (Q1 generate cap, Q2 body size) > returns 409 with pinned body on second generate with zero upstream calls
- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > returns 409 with zero upstream calls when only pending media exists
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > POST generate: exercise owner B gets 409 when B approved version already has media
- test/exercise-media-practitioner-access.test.ts > Exercise media cross-practitioner approved access (integration) > owner B succeeds on regenerate and internal when approver is A (generate 409 if media exists)

### Q1C

- test/exercise-media-didi-1212-qa.test.ts > exercise media DIDI-1212 QA (Q1 generate cap, Q2 body size) > shares the daily cap between generate and regenerate
- test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > returns 429 when the daily regeneration cap is reached
- test/exercise-media-service.test.ts > ExerciseMediaService (integration) > does not persist regeneration note text; records had_note only
- test/exercise-media-service.test.ts > ExerciseMediaService (integration) > enforces five regenerations per practitioner per UTC day

### Q2A

- test/exercise-media-didi-1212-qa.test.ts > exercise media DIDI-1212 QA (Q1 generate cap, Q2 body size) > accepts a JSON body exactly at the cap and rejects cap+1 via Content-Length

### Q2B

- test/exercise-media-didi-1212-qa.test.ts > exercise media DIDI-1212 QA (Q1 generate cap, Q2 body size) > accepts a JSON body exactly at the cap and rejects cap+1 via Content-Length

### Q2C

- test/exercise-media-didi-1212-qa.test.ts > exercise media DIDI-1212 QA (Q1 generate cap, Q2 body size) > rejects oversize body via bounded read when Content-Length is missing or understated

### P1

- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > replaces pending media and deletes previous draft object keys
- test/exercise-media-qa-round1.test.ts > exercise media QA round 1 (integration and unit) > stores approved regenerations as private draft media, not public

### P2

- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > serves pending draft only to the owner with Cache-Control no-store
- test/exercise-media-qa-round1.test.ts > exercise media QA round 1 (integration and unit) > stores approved regenerations as private draft media, not public

### P3

- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > serves pending draft only to the owner with Cache-Control no-store
- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > rejects non-requester internal serve with pinned 404 body

### P4

- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > serves pending draft only to the owner with Cache-Control no-store
- test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > generates draft media and blocks public serving until approved
- test/exercise-media-http-routes.test.ts > Exercise media HTTP routes (integration) > returns 400 invalid_input when access is missing or not public or internal

### C6R1

- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > serves pending draft only to the owner with Cache-Control no-store
- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > rejects non-requester internal serve with pinned 404 body

### C6R2

- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > rejects non-requester regenerate when pending was requested by someone else

### C6R3

- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > replaces pending media and deletes previous draft object keys

### C6R4

- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > keeps public live media after regenerate on an approved version
- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > serves pending draft only to the owner with Cache-Control no-store
- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > public serve and share-link media ignore pending_media_set_id
- test/exercise-media-service.test.ts > ExerciseMediaService (integration) > stores approved regenerations as pending draft without changing live media_set_id

### C6R5

- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > returns 409 with zero upstream calls when only pending media exists

### C6R6

- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > keeps public live media after regenerate on an approved version
- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > serves pending draft only to the owner with Cache-Control no-store
- test/exercise-media-approved-pending-f0ce9ed6.test.ts > exercise media approved pending draft (f0ce9ed6) > writes pending draft on generate for an approved version without live media
- test/exercise-media-pending-c6cac926.test.ts > exercise media pending model (c6cac926) > public serve and share-link media ignore pending_media_set_id
- test/exercise-media-service.test.ts > ExerciseMediaService (integration) > stores approved regenerations as pending draft without changing live media_set_id

Survivors: **3** / 34
