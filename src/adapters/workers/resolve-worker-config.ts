import type { PhysioAuthConfig, PhysioServerConfig } from "../../http/config.js";
import { resolveBetterAuthSecretForRuntime } from "../../http/config.js";
import { parseAllowedGoogleEmails } from "../../auth/allowed-emails.js";
import { resolveWorkerProductionWebAppBaseUrl } from "../../auth/worker-production-web-app-base-url.js";
import type { WorkerEnv } from "./create-app-dependencies.js";

function workerProductionAuthConfig(env: WorkerEnv): PhysioAuthConfig {
  const webAppBaseUrl = resolveWorkerProductionWebAppBaseUrl(env.WEB_APP_BASE_URL);
  const secret = resolveBetterAuthSecretForRuntime(env.BETTER_AUTH_SECRET ?? "");
  return {
    betterAuthSecret: secret,
    googleClientId: env.GOOGLE_CLIENT_ID?.trim() ?? "",
    googleClientSecret: env.GOOGLE_CLIENT_SECRET?.trim() ?? "",
    allowedGoogleEmails: parseAllowedGoogleEmails(env.PHYSIO_ALLOWED_GOOGLE_EMAILS),
    fakeGoogleProviderEnabled: false,
    authBaseUrl: webAppBaseUrl,
  };
}

export function resolveWorkerPhysioServerConfig(env: WorkerEnv): PhysioServerConfig {
  const webAppBaseUrl = resolveWorkerProductionWebAppBaseUrl(env.WEB_APP_BASE_URL);
  return {
    webAppBaseUrl,
    auth: workerProductionAuthConfig(env),
  };
}

export function resolveWorkerFailClosedPhysioServerConfig(
  env: WorkerEnv,
): PhysioServerConfig {
  let webAppBaseUrl: string | undefined;
  try {
    webAppBaseUrl = resolveWorkerProductionWebAppBaseUrl(env.WEB_APP_BASE_URL);
  } catch {
    webAppBaseUrl = undefined;
  }
  const fallbackBase = "https://example.workers.dev";
  const auth: PhysioAuthConfig = {
    betterAuthSecret: "",
    googleClientId: "",
    googleClientSecret: "",
    allowedGoogleEmails: new Set(),
    fakeGoogleProviderEnabled: false,
    authBaseUrl: webAppBaseUrl ?? fallbackBase,
  };
  return {
    webAppBaseUrl: webAppBaseUrl ?? fallbackBase,
    auth,
  };
}
