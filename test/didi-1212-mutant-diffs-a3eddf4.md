Head: `a3eddf4dcb4e5ccdeea1bfa651c7086addf28414`

## Diffs

### M1: create-worker-production-app-dependencies.ts: extraRouteHandlers cleared (route not registered on Worker)

```diff
diff --git a/src/adapters/workers/create-worker-production-app-dependencies.ts b/src/adapters/workers/create-worker-production-app-dependencies.ts
index 4bac8c9..8aac45f 100644
--- a/src/adapters/workers/create-worker-production-app-dependencies.ts
+++ b/src/adapters/workers/create-worker-production-app-dependencies.ts
@@ -47,7 +47,7 @@ export function createWorkerProductionAppDependencies(env: WorkerEnv): AppDepend
     mcpBearerAuth: createMcpBearerAuthHandler(authBundle, config, sql),
     guardedAppWithoutSession: "redirect",
     uiStatic,
-    extraRouteHandlers: [handleExerciseMediaRequest],
+    extraRouteHandlers: [],
     exerciseMediaImages: createWorkerImageGenerationPort(env),
   };
 }
```

### M2: require-practitioner.ts: session guard returns bypass token instead of 401

```diff
diff --git a/src/http/require-practitioner.ts b/src/http/require-practitioner.ts
index 21ff83a..6261507 100644
--- a/src/http/require-practitioner.ts
+++ b/src/http/require-practitioner.ts
@@ -6,7 +6,7 @@ export function requirePractitioner(
   session: PractitionerSession | null | undefined,
 ): string | Response {
   if (!session) {
-    return jsonUnauthorized();
+    return "mutant-session-bypass";
   }
   return session.practitionerId;
 }
```

### S01: create-worker-production-app-dependencies.ts: extraSessionPublicPath opens quota GET without session

```diff
diff --git a/src/adapters/workers/create-worker-production-app-dependencies.ts b/src/adapters/workers/create-worker-production-app-dependencies.ts
index 4bac8c9..c6c5a65 100644
--- a/src/adapters/workers/create-worker-production-app-dependencies.ts
+++ b/src/adapters/workers/create-worker-production-app-dependencies.ts
@@ -49,6 +49,7 @@ export function createWorkerProductionAppDependencies(env: WorkerEnv): AppDepend
     uiStatic,
     extraRouteHandlers: [handleExerciseMediaRequest],
     exerciseMediaImages: createWorkerImageGenerationPort(env),
+    extraSessionPublicPath: (pathname) => pathname === "/api/me/media-regeneration-quota",
   };
 }
```

### S02: create-worker-production-app-dependencies.ts: extraSessionPublicPath opens all exercise media routes without session

```diff
diff --git a/src/adapters/workers/create-worker-production-app-dependencies.ts b/src/adapters/workers/create-worker-production-app-dependencies.ts
index 4bac8c9..36f4fd3 100644
--- a/src/adapters/workers/create-worker-production-app-dependencies.ts
+++ b/src/adapters/workers/create-worker-production-app-dependencies.ts
@@ -49,6 +49,12 @@ export function createWorkerProductionAppDependencies(env: WorkerEnv): AppDepend
     uiStatic,
     extraRouteHandlers: [handleExerciseMediaRequest],
     exerciseMediaImages: createWorkerImageGenerationPort(env),
+    extraSessionPublicPath: (pathname) =>
+      pathname === "/api/me/media-regeneration-quota" ||
+      (pathname.startsWith("/api/me/exercise-versions/") &&
+        (pathname.endsWith("/media/generate") ||
+          pathname.endsWith("/media/regenerate") ||
+          pathname.includes("/media?"))),
   };
 }
```

### M3: exercise-media-service.ts: owner check removed (exercise_created_by !== practitionerId)

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..a0c5689 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -582,7 +582,7 @@ export class ExerciseMediaService {
     practitionerId: string,
   ): Promise<ExerciseVersionMediaRow> {
     const version = await this.versions.findVersionWithExerciseOwner(versionId);
-    if (!version || version.exercise_created_by !== practitionerId) {
+    if (!version) {
       throw this.versionNotFoundError();
     }
     return version;
```

### M4: create-image-generation-port.ts: fake chosen when PHYSIO_DEEPINFRA_API_KEY present (if (!apiKey))

```diff
diff --git a/src/adapters/node/create-image-generation-port.ts b/src/adapters/node/create-image-generation-port.ts
index b95c4a6..7326fba 100644
--- a/src/adapters/node/create-image-generation-port.ts
+++ b/src/adapters/node/create-image-generation-port.ts
@@ -15,7 +15,7 @@ export function createImageGenerationPort(
   options: CreateImageGenerationPortOptions = {},
 ): ImageGenerationPort {
   const apiKey = env.PHYSIO_DEEPINFRA_API_KEY?.trim();
-  if (apiKey) {
+  if (!apiKey) {
     return new DeepInfraFluxKleinImageGeneration({
       apiKey,
       fetchImpl: options.fetchImpl,
```

### M5: create-image-generation-port.ts: DeepInfra chosen when key absent (if (true))

```diff
diff --git a/src/adapters/node/create-image-generation-port.ts b/src/adapters/node/create-image-generation-port.ts
index b95c4a6..e691a30 100644
--- a/src/adapters/node/create-image-generation-port.ts
+++ b/src/adapters/node/create-image-generation-port.ts
@@ -15,7 +15,7 @@ export function createImageGenerationPort(
   options: CreateImageGenerationPortOptions = {},
 ): ImageGenerationPort {
   const apiKey = env.PHYSIO_DEEPINFRA_API_KEY?.trim();
-  if (apiKey) {
+  if (true) {
     return new DeepInfraFluxKleinImageGeneration({
       apiKey,
       fetchImpl: options.fetchImpl,
```

### M6: create-worker-production-app-dependencies.ts: InMemoryObjectStorage kept in prod

```diff
diff --git a/src/adapters/workers/create-worker-production-app-dependencies.ts b/src/adapters/workers/create-worker-production-app-dependencies.ts
index 4bac8c9..8f33720 100644
--- a/src/adapters/workers/create-worker-production-app-dependencies.ts
+++ b/src/adapters/workers/create-worker-production-app-dependencies.ts
@@ -5,6 +5,7 @@ import {
   logWorkerMediaBindingMissingOnce,
   MediaBindingMissingObjectStorage,
 } from "./media-binding-missing-object-storage.js";
+import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";
 import { R2ObjectStorage } from "./r2-object-storage.js";
 import type { ObjectStoragePort } from "../../storage/ports/object-storage.js";
 import { createPhysioMcpHttpHandler } from "./mcp/handle-mcp-http-request.js";
@@ -54,7 +55,7 @@ export function createWorkerProductionAppDependencies(env: WorkerEnv): AppDepend

 function resolveProductionObjectStorage(env: WorkerEnv): ObjectStoragePort {
   if (env.PHYSIO_MEDIA) {
-    return new R2ObjectStorage(env.PHYSIO_MEDIA);
+    return new InMemoryObjectStorage();
   }
   logWorkerMediaBindingMissingOnce();
   return new MediaBindingMissingObjectStorage();
```

### M7: .github/workflows/ci.yml: PHYSIO_DEEPINFRA_API_KEY on PR CI check job

```diff
diff --git a/.github/workflows/ci.yml b/.github/workflows/ci.yml
index 0e89c75..50594d2 100644
--- a/.github/workflows/ci.yml
+++ b/.github/workflows/ci.yml
@@ -104,6 +104,8 @@ jobs:

   check:
     name: check
+    env:
+      PHYSIO_DEEPINFRA_API_KEY: ${{ secrets.PHYSIO_DEEPINFRA_API_KEY }}
     runs-on: ubuntu-latest
     steps:
       - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
```

### M8: .github/workflows/deploy-physio-mcp-worker.yml: PHYSIO_DEEPINFRA_API_KEY removed from gated Put step

```diff
diff --git a/.github/workflows/deploy-physio-mcp-worker.yml b/.github/workflows/deploy-physio-mcp-worker.yml
index 022a9c3..36a1c08 100644
--- a/.github/workflows/deploy-physio-mcp-worker.yml
+++ b/.github/workflows/deploy-physio-mcp-worker.yml
@@ -82,7 +82,6 @@ jobs:
           GOOGLE_CLIENT_SECRET: ${{ secrets.GOOGLE_CLIENT_SECRET }}
           BETTER_AUTH_SECRET: ${{ secrets.BETTER_AUTH_SECRET }}
           PHYSIO_ALLOWED_GOOGLE_EMAILS: ${{ secrets.PHYSIO_ALLOWED_GOOGLE_EMAILS }}
-          PHYSIO_DEEPINFRA_API_KEY: ${{ secrets.PHYSIO_DEEPINFRA_API_KEY }}
         run: |
           set -euo pipefail
           node scripts/assert-production-deploy-secrets.mjs
```

### M9: exercise-media.ts: key leaked into ImageGenerationError JSON response

```diff
diff --git a/src/http/routes/exercise-media.ts b/src/http/routes/exercise-media.ts
index d3b6fb4..443decc 100644
--- a/src/http/routes/exercise-media.ts
+++ b/src/http/routes/exercise-media.ts
@@ -109,7 +109,7 @@ function routeErrorResponse(error: unknown): Response | null {
     return serviceErrorResponse(error);
   }
   if (error instanceof ImageGenerationError) {
-    return Response.json({ error: error.code }, { status: 502, headers: JSON_HEADERS });
+    return Response.json({ error: error.code, debug: process.env.PHYSIO_DEEPINFRA_API_KEY }, { status: 502, headers: JSON_HEADERS });
   }
   return null;
 }
```

### L02: exercise-media.ts: 502 ImageGenerationError body includes upstream message

```diff
diff --git a/src/http/routes/exercise-media.ts b/src/http/routes/exercise-media.ts
index d3b6fb4..ca67355 100644
--- a/src/http/routes/exercise-media.ts
+++ b/src/http/routes/exercise-media.ts
@@ -109,7 +109,7 @@ function routeErrorResponse(error: unknown): Response | null {
     return serviceErrorResponse(error);
   }
   if (error instanceof ImageGenerationError) {
-    return Response.json({ error: error.code }, { status: 502, headers: JSON_HEADERS });
+    return Response.json({ error: error.code, message: error.message }, { status: 502, headers: JSON_HEADERS });
   }
   return null;
 }
```

### L03: deepinfra-flux-klein-image-generation.ts: apiKey logged on HTTP request failure

```diff
diff --git a/src/adapters/node/deepinfra-flux-klein-image-generation.ts b/src/adapters/node/deepinfra-flux-klein-image-generation.ts
index fd34ac1..ce02097 100644
--- a/src/adapters/node/deepinfra-flux-klein-image-generation.ts
+++ b/src/adapters/node/deepinfra-flux-klein-image-generation.ts
@@ -236,7 +236,7 @@ export class DeepInfraFluxKleinImageGeneration implements ImageGenerationPort {
       await readBoundedResponseText(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES).catch(
         () => "",
       );
-      requestFailed(response.status);
+      console.error("deepinfra_request_failed", this.config.apiKey); requestFailed(response.status);
     }
     const payload = await readJsonBody(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES);
     return imageFromPayload(payload);
@@ -263,7 +263,7 @@ export class DeepInfraFluxKleinImageGeneration implements ImageGenerationPort {
       await readBoundedResponseText(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES).catch(
         () => "",
       );
-      requestFailed(response.status);
+      console.error("deepinfra_request_failed", this.config.apiKey); requestFailed(response.status);
     }
     const payload = await readJsonBody(response, DEEPINFRA_IMAGE_JSON_MAX_BYTES);
     return imageFromPayload(payload);
```

### K09: deploy-physio-mcp-worker.yml: deploy job environment not production

```diff
diff --git a/.github/workflows/deploy-physio-mcp-worker.yml b/.github/workflows/deploy-physio-mcp-worker.yml
index 022a9c3..46f9fa7 100644
--- a/.github/workflows/deploy-physio-mcp-worker.yml
+++ b/.github/workflows/deploy-physio-mcp-worker.yml
@@ -16,7 +16,7 @@ jobs:
   deploy:
     if: github.ref == 'refs/heads/main'
     runs-on: ubuntu-latest
-    environment: production
+    environment: staging
     steps:
       - uses: actions/checkout@11d5960a326750d5838078e36cf38b85af677262 # v4.4.0
         with:
```

### K11: deploy-physio-mcp-worker.yml: PHYSIO_DEEPINFRA_API_KEY on non-Put step

```diff
(empty — mutant no-op)
```

### M11: exercise-media.ts: no-store removed from SERVE_JSON_HEADERS

```diff
diff --git a/src/http/routes/exercise-media.ts b/src/http/routes/exercise-media.ts
index d3b6fb4..7990f30 100644
--- a/src/http/routes/exercise-media.ts
+++ b/src/http/routes/exercise-media.ts
@@ -26,7 +26,7 @@ const JSON_HEADERS = { "content-type": "application/json" };

 const SERVE_JSON_HEADERS = {
   ...JSON_HEADERS,
-  "cache-control": "no-store",
+  "cache-control": "public, max-age=3600",
 };

 const EXERCISE_MEDIA_ME_VERSION_PATH =
```

### B1D: deepinfra-flux-klein-image-generation.ts: restore ?? fetch (unbound)

```diff
diff --git a/src/adapters/node/deepinfra-flux-klein-image-generation.ts b/src/adapters/node/deepinfra-flux-klein-image-generation.ts
index fd34ac1..39535bc 100644
--- a/src/adapters/node/deepinfra-flux-klein-image-generation.ts
+++ b/src/adapters/node/deepinfra-flux-klein-image-generation.ts
@@ -164,7 +164,7 @@ export class DeepInfraFluxKleinImageGeneration implements ImageGenerationPort {
     this.imageSize = config.imageSize ?? DEEPINFRA_FLUX_KLEIN_IMAGE_SIZE;
     this.requestTimeoutMs =
       config.requestTimeoutMs ?? DEEPINFRA_IMAGE_REQUEST_TIMEOUT_MS;
-    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
+    this.fetchImpl = config.fetchImpl ?? fetch;
   }

   async generateStartAndEndImages(
```

### B1F: fal-flux-klein-image-generation.ts: restore ?? fetch (unbound)

```diff
diff --git a/src/adapters/node/fal-flux-klein-image-generation.ts b/src/adapters/node/fal-flux-klein-image-generation.ts
index 1b6c6c1..9b831d4 100644
--- a/src/adapters/node/fal-flux-klein-image-generation.ts
+++ b/src/adapters/node/fal-flux-klein-image-generation.ts
@@ -84,7 +84,7 @@ export class FalFluxKleinImageGeneration implements ImageGenerationPort {
     }
     this.modelId = config.modelId ?? FAL_FLUX_KLEIN_4B_MODEL_ID;
     this.editModelId = config.editModelId ?? FAL_FLUX_KLEIN_4B_EDIT_MODEL_ID;
-    this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));
+    this.fetchImpl = config.fetchImpl ?? fetch;
   }

   async generateStartAndEndImages(input: GenerateExerciseImagesInput): Promise<{
```

### Q1A: exercise-media.ts: wrong 409 error code string

```diff
diff --git a/src/http/routes/exercise-media.ts b/src/http/routes/exercise-media.ts
index d3b6fb4..a37b18d 100644
--- a/src/http/routes/exercise-media.ts
+++ b/src/http/routes/exercise-media.ts
@@ -86,7 +86,7 @@ function mediaService(deps: AppDependencies): ExerciseMediaService {
 function serviceErrorResponse(error: ExerciseMediaServiceError): Response {
   if (error.code === "exercise_media_already_generated") {
     return Response.json(
-      { error: "exercise_media_already_generated" },
+      { error: "media_already_exists" },
       { status: 409, headers: JSON_HEADERS },
     );
   }
```

### Q1B: exercise-media.ts: 409 → 400 for already generated

```diff
diff --git a/src/http/routes/exercise-media.ts b/src/http/routes/exercise-media.ts
index d3b6fb4..f35cb5b 100644
--- a/src/http/routes/exercise-media.ts
+++ b/src/http/routes/exercise-media.ts
@@ -87,7 +87,7 @@ function serviceErrorResponse(error: ExerciseMediaServiceError): Response {
   if (error.code === "exercise_media_already_generated") {
     return Response.json(
       { error: "exercise_media_already_generated" },
-      { status: 409, headers: JSON_HEADERS },
+      { status: 400, headers: JSON_HEADERS },
     );
   }
   const status =
```

### Q1C: exercise-media-service.ts: generate skips cap increment

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..955f378 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -176,16 +176,6 @@ export class ExerciseMediaService {
             end: generated.end,
             updateVersion: true,
           });
-    const nowIso = this.clock().toISOString();
-    await this.regenerations.insert({
-      id: this.createId(),
-      practitionerId: input.practitionerId,
-      exerciseId: version.exercise_id,
-      exerciseVersionId: version.id,
-      scope: "both",
-      hadNote: regenerationNote !== null,
-      createdAt: nowIso,
-    });
     return media;
   }
```

### Q2A: bounded-json-request-body.ts: remove Content-Length precheck

```diff
diff --git a/src/http/bounded-json-request-body.ts b/src/http/bounded-json-request-body.ts
index 37186b1..383798f 100644
--- a/src/http/bounded-json-request-body.ts
+++ b/src/http/bounded-json-request-body.ts
@@ -54,11 +54,6 @@ export async function readBoundedExerciseMediaJsonObject(
   request: Request,
   maxBytes: number = EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES,
 ): Promise<Record<string, unknown> | typeof EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE> {
-  const contentLength = contentLengthHeader(request);
-  if (contentLength !== null && contentLength > maxBytes) {
-    return EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE;
-  }
-
   let bytes: Uint8Array;
   try {
     bytes = await readBodyBytesBounded(request, maxBytes);
```

### Q2B: bounded-json-request-body.ts: reject at cap (>=)

```diff
diff --git a/src/http/bounded-json-request-body.ts b/src/http/bounded-json-request-body.ts
index 37186b1..85e4b4f 100644
--- a/src/http/bounded-json-request-body.ts
+++ b/src/http/bounded-json-request-body.ts
@@ -55,7 +55,7 @@ export async function readBoundedExerciseMediaJsonObject(
   maxBytes: number = EXERCISE_MEDIA_JSON_REQUEST_BODY_MAX_BYTES,
 ): Promise<Record<string, unknown> | typeof EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE> {
   const contentLength = contentLengthHeader(request);
-  if (contentLength !== null && contentLength > maxBytes) {
+  if (contentLength !== null && contentLength >= maxBytes) {
     return EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE;
   }
```

### Q2C: bounded-json-request-body.ts: skip bounded read (arrayBuffer)

```diff
diff --git a/src/http/bounded-json-request-body.ts b/src/http/bounded-json-request-body.ts
index 37186b1..97237d5 100644
--- a/src/http/bounded-json-request-body.ts
+++ b/src/http/bounded-json-request-body.ts
@@ -61,7 +61,7 @@ export async function readBoundedExerciseMediaJsonObject(

   let bytes: Uint8Array;
   try {
-    bytes = await readBodyBytesBounded(request, maxBytes);
+    bytes = new Uint8Array(await request.arrayBuffer());
   } catch (error) {
     if (
       error instanceof Error &&
```

### P1: persistApprovedPendingMediaSet writes public object visibility (approved generate/regenerate)

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..0dfe73d 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -483,7 +483,7 @@ export class ExerciseMediaService {
       keys.startObjectKey,
       input.start.bytes,
       input.start.contentType,
-      "draft",
+      "public",
     );
     await this.media.putImage(
       keys.endObjectKey,
```

### P2: persistApprovedPendingMediaSet inserts public exercise_media_sets row

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..601a02c 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -496,7 +496,7 @@ export class ExerciseMediaService {
       startObjectKey: keys.startObjectKey,
       endObjectKey: keys.endObjectKey,
       startProviderUrl: input.start.providerSourceUrl ?? null,
-      visibility: "draft",
+      visibility: "public",
       createdAt,
     });
     await this.versions.updatePendingDraft(input.version.id, {
```

### P3: getMediaForServing internal serves pending_media_set_id without owner gate

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..1d4b763 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -407,9 +407,7 @@ export class ExerciseMediaService {
     if (version.pending_media_set_id) {
       const pendingRow = await this.mediaSets.findById(version.pending_media_set_id);
       if (pendingRow) {
-        if (sessionPractitionerId !== version.pending_media_requested_by) {
-          throw this.versionNotFoundError();
-        }
+        /* pending requester gate removed */
         return {
           mediaSetId: pendingRow.id,
           startObjectKey: pendingRow.start_object_key,
```

### P4: exercise-media serve JSON drops Cache-Control no-store

```diff
diff --git a/src/http/routes/exercise-media.ts b/src/http/routes/exercise-media.ts
index d3b6fb4..ed66904 100644
--- a/src/http/routes/exercise-media.ts
+++ b/src/http/routes/exercise-media.ts
@@ -24,10 +24,7 @@ import {

 const JSON_HEADERS = { "content-type": "application/json" };

-const SERVE_JSON_HEADERS = {
-  ...JSON_HEADERS,
-  "cache-control": "no-store",
-};
+const SERVE_JSON_HEADERS = { ...JSON_HEADERS };

 const EXERCISE_MEDIA_ME_VERSION_PATH =
   /^\/api\/me\/exercise-versions\/([^/]+)\/media\/(generate|regenerate)$/;
```

### C6R1: exercise-media-service.ts: pending internal serve skips requester match

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..5126866 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -407,7 +407,7 @@ export class ExerciseMediaService {
     if (version.pending_media_set_id) {
       const pendingRow = await this.mediaSets.findById(version.pending_media_set_id);
       if (pendingRow) {
-        if (sessionPractitionerId !== version.pending_media_requested_by) {
+        if (false && sessionPractitionerId !== version.pending_media_requested_by) {
           throw this.versionNotFoundError();
         }
         return {
```

### C6R2: exercise-media-service.ts: approved regenerate skips pending requester gate

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..c3e1a17 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -230,7 +230,7 @@ export class ExerciseMediaService {
     if (
       version.status === "approved" &&
       version.pending_media_requested_by &&
-      version.pending_media_requested_by !== input.practitionerId
+      false
     ) {
       throw this.versionNotFoundError();
     }
```

### C6R3: exercise-media-service.ts: replace pending without deleting old draft objects

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..fdce54f 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -464,18 +464,6 @@ export class ExerciseMediaService {
     };
     end: { bytes: Uint8Array; contentType: string };
   }): Promise<ExerciseMediaSetView> {
-    if (input.version.pending_media_set_id) {
-      const previous = await this.mediaSets.findById(
-        input.version.pending_media_set_id,
-      );
-      if (previous) {
-        await this.media.deleteDraftSet({
-          startObjectKey: previous.start_object_key,
-          endObjectKey: previous.end_object_key,
-        });
-        await this.mediaSets.deleteById(previous.id);
-      }
-    }
     const mediaSetId = this.createId();
     const keys = mediaObjectKeys(mediaSetId);
     const createdAt = this.clock().toISOString();
```

### C6R4: exercise-media-service.ts: public serve prefers pending_media_set_id

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..ce69ba3 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -381,10 +381,11 @@ export class ExerciseMediaService {
   ): Promise<ExerciseMediaSetView | null> {
     if (access === "public") {
       const version = await this.requireVersionForPublicServing(exerciseVersionId);
-      if (!version.media_set_id) {
+      const publicSetId = version.pending_media_set_id ?? version.media_set_id;
+      if (!publicSetId) {
         return null;
       }
-      const row = await this.mediaSets.findById(version.media_set_id);
+      const row = await this.mediaSets.findById(publicSetId);
       if (!row) {
         return null;
       }
```

### C6R5: exercise-media-service.ts: generate allowed when pending already exists

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..4d7d2e2 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -146,15 +146,6 @@ export class ExerciseMediaService {
         );
       }
     }
-    if (version.pending_media_set_id) {
-      const pending = await this.mediaSets.findById(version.pending_media_set_id);
-      if (pending) {
-        throw new ExerciseMediaServiceError(
-          "Exercise media already generated for this version",
-          "exercise_media_already_generated",
-        );
-      }
-    }
     const promptContext = this.promptContextFromVersion(version, regenerationNote);
     const generated = await this.images.generateStartAndEndImages({
       startPrompt: buildStartImagePrompt(promptContext),
```

### C6R6: exercise-media-service.ts: approved pending persist also updates live media_set_id

```diff
diff --git a/src/services/exercise-media/exercise-media-service.ts b/src/services/exercise-media/exercise-media-service.ts
index d9d3744..9f6e212 100644
--- a/src/services/exercise-media/exercise-media-service.ts
+++ b/src/services/exercise-media/exercise-media-service.ts
@@ -499,6 +499,7 @@ export class ExerciseMediaService {
       visibility: "draft",
       createdAt,
     });
+    await this.versions.updateMediaSetId(input.version.id, mediaSetId);
     await this.versions.updatePendingDraft(input.version.id, {
       pendingMediaSetId: mediaSetId,
       pendingMediaRequestedBy: input.practitionerId,
```

Survivors: **3** / 34
