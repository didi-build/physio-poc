/** GitHub `production` environment secrets uploaded to the Worker at deploy (DIDI-1042). */
export const PRODUCTION_WORKER_AUTH_SECRET_NAMES = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "PHYSIO_ALLOWED_GOOGLE_EMAILS",
];

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
export function missingProductionWorkerAuthSecretNames(env) {
  const missing = [];
  for (const name of PRODUCTION_WORKER_AUTH_SECRET_NAMES) {
    const value = env[name];
    if (typeof value !== "string" || value.trim().length === 0) {
      missing.push(name);
    }
  }
  return missing;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Record<string, string>}
 */
export function buildWorkerAuthSecretsPayload(env) {
  const missing = missingProductionWorkerAuthSecretNames(env);
  if (missing.length > 0) {
    const err = new Error("production Worker auth secrets are incomplete");
    err.code = "MISSING_PRODUCTION_WORKER_AUTH_SECRETS";
    err.missing = missing;
    throw err;
  }
  /** @type {Record<string, string>} */
  const payload = {};
  for (const name of PRODUCTION_WORKER_AUTH_SECRET_NAMES) {
    payload[name] = env[name].trim();
  }
  return payload;
}
