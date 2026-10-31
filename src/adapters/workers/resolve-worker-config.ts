import {
  createPhysioServerConfig,
  resolvePhysioAuthConfig,
  resolveWebAppBaseUrl,
  type PhysioServerConfig,
} from "../../http/config.js";
import type { WorkerEnv } from "./create-app-dependencies.js";

function workerProductionAuthBaseUrl(env: WorkerEnv): string {
  return resolveWebAppBaseUrl(env.WEB_APP_BASE_URL);
}

export function resolveWorkerPhysioServerConfig(env: WorkerEnv): PhysioServerConfig {
  const webAppBaseUrl = workerProductionAuthBaseUrl(env);
  const auth = resolvePhysioAuthConfig({
    betterAuthSecret: env.BETTER_AUTH_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    googleClientSecret: env.GOOGLE_CLIENT_SECRET,
    allowedGoogleEmails: env.PHYSIO_ALLOWED_GOOGLE_EMAILS,
    fakeGoogleProvider: "false",
    authBaseUrl: webAppBaseUrl,
    fallbackHost: new URL(webAppBaseUrl).host,
    nodeEnv: "production",
  });
  return createPhysioServerConfig({ webAppBaseUrl, auth });
}

export function resolveWorkerFailClosedPhysioServerConfig(
  env: WorkerEnv,
): PhysioServerConfig {
  let webAppBaseUrl = env.WEB_APP_BASE_URL;
  try {
    resolveWebAppBaseUrl(webAppBaseUrl);
  } catch {
    webAppBaseUrl = undefined;
  }
  const auth = resolvePhysioAuthConfig({
    fakeGoogleProvider: "false",
    authBaseUrl: webAppBaseUrl,
    fallbackHost: "example.workers.dev",
    nodeEnv: "production",
  });
  return createPhysioServerConfig({ webAppBaseUrl, auth });
}
