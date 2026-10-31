/** Worker `vars` / secrets required before Better Auth replaces FailClosedAuthPort (DIDI-1153). */
export const WORKER_PRODUCTION_AUTH_SECRET_ENV_NAMES = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "PHYSIO_ALLOWED_GOOGLE_EMAILS",
] as const;

/** Production base URL Worker var from DIDI-1044 (#59); same name on main wrangler `vars`. */
export const WORKER_PRODUCTION_WEB_APP_BASE_URL_ENV_NAME = "WEB_APP_BASE_URL";

export type WorkerProductionAuthEnv = {
  WEB_APP_BASE_URL?: string;
  AUTH_BASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PHYSIO_ALLOWED_GOOGLE_EMAILS?: string;
};

function isNonEmptyEnvValue(value: string | undefined): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

/** Returns env keys that are missing or blank; empty array means production auth env is complete. */
export function missingWorkerProductionAuthEnvKeys(
  env: WorkerProductionAuthEnv,
): string[] {
  const missing: string[] = [];
  for (const name of WORKER_PRODUCTION_AUTH_SECRET_ENV_NAMES) {
    if (!isNonEmptyEnvValue(env[name])) {
      missing.push(name);
    }
  }
  if (!isNonEmptyEnvValue(env[WORKER_PRODUCTION_WEB_APP_BASE_URL_ENV_NAME])) {
    missing.push(WORKER_PRODUCTION_WEB_APP_BASE_URL_ENV_NAME);
  }
  return missing;
}

export function isWorkerProductionAuthEnvComplete(
  env: WorkerProductionAuthEnv,
): boolean {
  return missingWorkerProductionAuthEnvKeys(env).length === 0;
}
