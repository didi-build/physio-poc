import type { D1Database } from "@better-auth/core";
import type { AppDependencies } from "../../http/app.js";
import { D1SqlStorage } from "./d1-sql-storage.js";
import {
  logWorkerMediaBindingMissingOnce,
  MediaBindingMissingObjectStorage,
} from "./media-binding-missing-object-storage.js";
import { R2ObjectStorage } from "./r2-object-storage.js";
import type { ObjectStoragePort } from "../../storage/ports/object-storage.js";
import { createPhysioMcpHttpHandler } from "./mcp/handle-mcp-http-request.js";
import {
  createMcpBearerAuthHandler,
  createPhysioAuthPort,
} from "../node/create-physio-auth-port.js";
import { resolveWorkerPhysioServerConfig } from "./resolve-worker-config.js";
import { workerCimdMetadataFetch } from "./worker-cimd-metadata-fetch.js";
import type { WorkerEnv } from "./create-app-dependencies.js";
import { createWorkerAssetsUiStaticPort } from "./worker-assets-ui-static-port.js";
import { resolveExerciseDraftGenerator } from "../deepinfra/resolve-exercise-draft-generator.js";
import { handleExerciseMediaRequest } from "../../http/routes/exercise-media.js";
import { createWorkerImageGenerationPort } from "./create-worker-image-generation-port.js";
import { logWorkerFakeDeepinfraProviderOnce } from "./worker-fake-deepinfra-provider-log.js";
import { createWorkerDraftGenerationWorkflowPort } from "./worker-draft-generation-workflow-port.js";
import type { ExerciseRequestDraftGenerationWorkflowEnv } from "./exercise-request-draft-generation-workflow.js";

/** Production Better Auth wiring (dynamic import from create-app-dependencies). */
export function createWorkerProductionAppDependencies(
  env: ExerciseRequestDraftGenerationWorkflowEnv,
): AppDependencies {
  if (!env.PHYSIO_DB) {
    throw new Error("PHYSIO_DB binding is required for production Worker auth");
  }
  if (!env.PHYSIO_DEEPINFRA_API_KEY?.trim()) {
    logWorkerFakeDeepinfraProviderOnce();
  }
  const sql = new D1SqlStorage(env.PHYSIO_DB);
  const config = resolveWorkerPhysioServerConfig(env);
  const authBundle = createPhysioAuthPort(
    env.PHYSIO_DB as unknown as D1Database,
    sql,
    config,
    {
      cimdMetadataFetch: workerCimdMetadataFetch,
    },
  );
  const uiStatic = env.ASSETS
    ? createWorkerAssetsUiStaticPort(env.ASSETS, config.webAppBaseUrl)
    : undefined;
  const objects = resolveProductionObjectStorage(env);
  return {
    sql,
    objects,
    config,
    auth: authBundle.auth,
    mcp: createPhysioMcpHttpHandler({ config, sql }),
    mcpBearerAuth: createMcpBearerAuthHandler(authBundle, config, sql),
    guardedAppWithoutSession: "redirect",
    uiStatic,
    exerciseDraftGenerator: resolveExerciseDraftGenerator(env),
    extraRouteHandlers: [handleExerciseMediaRequest],
    exerciseMediaImages: createWorkerImageGenerationPort(env),
    draftGenerationWorkflow: env.PHYSIO_EXERCISE_REQUEST_DRAFT_GENERATION
      ? createWorkerDraftGenerationWorkflowPort(env)
      : undefined,
  };
}

function resolveProductionObjectStorage(env: WorkerEnv): ObjectStoragePort {
  if (env.PHYSIO_MEDIA) {
    return new R2ObjectStorage(env.PHYSIO_MEDIA);
  }
  logWorkerMediaBindingMissingOnce();
  return new MediaBindingMissingObjectStorage();
}
