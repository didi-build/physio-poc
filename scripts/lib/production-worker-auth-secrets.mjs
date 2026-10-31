/** GitHub `production` environment secrets uploaded to the Worker at deploy (DIDI-1042). */
export const PRODUCTION_WORKER_AUTH_SECRET_NAMES = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "PHYSIO_ALLOWED_GOOGLE_EMAILS",
];

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {{ missing: string[]; invalid: string[] }}
 */
export function productionWorkerAuthSecretProblems(env) {
  const missing = [];
  const invalid = [];
  for (const name of PRODUCTION_WORKER_AUTH_SECRET_NAMES) {
    const value = env[name];
    if (typeof value !== "string" || value.trim().length === 0) {
      missing.push(name);
      continue;
    }
    if (/[\r\n]/.test(value)) {
      invalid.push(name);
    }
  }
  return { missing, invalid };
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
export function missingProductionWorkerAuthSecretNames(env) {
  return productionWorkerAuthSecretProblems(env).missing;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
export function invalidProductionWorkerAuthSecretNames(env) {
  return productionWorkerAuthSecretProblems(env).invalid;
}

/**
 * @param {Record<string, string>} payload
 * @returns {string}
 */
export function serializeWorkerAuthSecretsBulkPayload(payload) {
  return `${JSON.stringify(payload)}\n`;
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @returns {Record<string, string>}
 */
export function buildWorkerAuthSecretsPayload(env) {
  const { missing, invalid } = productionWorkerAuthSecretProblems(env);
  if (invalid.length > 0) {
    const err = new Error("production Worker auth secrets contain invalid values");
    err.code = "INVALID_PRODUCTION_WORKER_AUTH_SECRETS";
    err.invalid = invalid;
    throw err;
  }
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
