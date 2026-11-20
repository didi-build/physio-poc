export const MIN_PRODUCTION_BETTER_AUTH_SECRET_LENGTH = 32;

/** GitHub `production` environment secrets uploaded to the Worker at deploy (DIDI-1042). */
export const PRODUCTION_WORKER_AUTH_SECRET_NAMES = [
  "GOOGLE_CLIENT_ID",
  "GOOGLE_CLIENT_SECRET",
  "BETTER_AUTH_SECRET",
  "PHYSIO_ALLOWED_GOOGLE_EMAILS",
  "PHYSIO_DEEPINFRA_API_KEY",
];

/** Optional production secrets uploaded when non-empty (DIDI-1212). Never required for deploy preflight. */
export const PRODUCTION_WORKER_OPTIONAL_SECRET_NAMES = ["PHYSIO_DEEPINFRA_API_KEY"];

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
 * @param {NodeJS.ProcessEnv} env
 * @returns {string[]}
 */
export function productionDeployBetterAuthSecretLengthProblemNames(env) {
  const value = env.BETTER_AUTH_SECRET;
  if (typeof value !== "string") {
    return [];
  }
  if (/[\r\n]/.test(value)) {
    return [];
  }
  if (value.trim().length === 0) {
    return [];
  }
  if (value.trim().length < MIN_PRODUCTION_BETTER_AUTH_SECRET_LENGTH) {
    return ["BETTER_AUTH_SECRET"];
  }
  return [];
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
 * @returns {{ invalid: string[] }}
 */
export function productionWorkerOptionalSecretProblems(env) {
  const invalid = [];
  for (const name of PRODUCTION_WORKER_OPTIONAL_SECRET_NAMES) {
    const value = env[name];
    if (typeof value !== "string" || value.trim().length === 0) {
      continue;
    }
    if (/[\r\n]/.test(value)) {
      invalid.push(name);
    }
  }
  return { invalid };
}

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
  const shortSecretNames = productionDeployBetterAuthSecretLengthProblemNames(env);
  if (shortSecretNames.length > 0) {
    const err = new Error("production Worker auth secrets are invalid");
    err.code = "INVALID_PRODUCTION_WORKER_AUTH_SECRETS";
    err.invalid = shortSecretNames;
    throw err;
  }
  const optionalProblems = productionWorkerOptionalSecretProblems(env);
  if (optionalProblems.invalid.length > 0) {
    const err = new Error("production Worker optional secrets contain invalid values");
    err.code = "INVALID_PRODUCTION_WORKER_AUTH_SECRETS";
    err.invalid = optionalProblems.invalid;
    throw err;
  }
  /** @type {Record<string, string>} */
  const payload = {};
  for (const name of PRODUCTION_WORKER_AUTH_SECRET_NAMES) {
    payload[name] = env[name].trim();
  }
  for (const name of PRODUCTION_WORKER_OPTIONAL_SECRET_NAMES) {
    const value = env[name];
    if (typeof value === "string" && value.trim().length > 0) {
      payload[name] = value.trim();
    }
  }
  return payload;
}
