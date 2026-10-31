import {
  resolveNodePhysioServerConfig,
  type NodeEnvInput,
} from "../node/resolve-node-config.js";
import type { PhysioServerConfig } from "../../http/config.js";
import type { WorkerEnv } from "./create-app-dependencies.js";

export function resolveWorkerPhysioServerConfig(env: WorkerEnv): PhysioServerConfig {
  const nodeEnv: NodeEnvInput = {
    WEB_APP_BASE_URL: env.WEB_APP_BASE_URL,
    AUTH_BASE_URL: env.AUTH_BASE_URL ?? env.WEB_APP_BASE_URL,
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    GOOGLE_CLIENT_ID: env.GOOGLE_CLIENT_ID,
    GOOGLE_CLIENT_SECRET: env.GOOGLE_CLIENT_SECRET,
    PHYSIO_ALLOWED_GOOGLE_EMAILS: env.PHYSIO_ALLOWED_GOOGLE_EMAILS,
    PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "false",
    NODE_ENV: "production",
  };
  return resolveNodePhysioServerConfig(nodeEnv, "example.workers.dev");
}

export function resolveWorkerFailClosedPhysioServerConfig(
  env: WorkerEnv,
): PhysioServerConfig {
  return resolveNodePhysioServerConfig(
    {
      WEB_APP_BASE_URL: env.WEB_APP_BASE_URL,
      PHYSIO_USE_FAKE_GOOGLE_PROVIDER: "false",
      NODE_ENV: "production",
    },
    "example.workers.dev",
  );
}
