import { parseAllowedGoogleEmails } from "./allowed-emails.js";
import type { WorkerProductionAuthEnv } from "./worker-production-auth-env.js";
import {
  InvalidAuthConfigError,
  InvalidWebAppBaseUrlError,
  resolveBetterAuthSecretForRuntime,
  resolveWebAppBaseUrl,
} from "../http/config.js";

/** Fixed log line when production auth env is present but invalid (no env values). */
export const WORKER_PRODUCTION_AUTH_MISCONFIG_LOG =
  "physio_worker_production_auth_misconfigured";

/** Validates production Worker auth env values after presence checks (throws on malformed). */
export function assertWorkerProductionAuthConfigValid(
  env: WorkerProductionAuthEnv,
): void {
  try {
    resolveWebAppBaseUrl(env.WEB_APP_BASE_URL);
  } catch (error) {
    if (error instanceof InvalidWebAppBaseUrlError) {
      throw error;
    }
    throw new InvalidWebAppBaseUrlError("WEB_APP_BASE_URL must be a valid https URL.");
  }
  resolveBetterAuthSecretForRuntime(env.BETTER_AUTH_SECRET ?? "");
  const allowlist = parseAllowedGoogleEmails(env.PHYSIO_ALLOWED_GOOGLE_EMAILS);
  if (allowlist.size === 0) {
    throw new InvalidAuthConfigError(
      "PHYSIO_ALLOWED_GOOGLE_EMAILS must include at least one email.",
    );
  }
}
