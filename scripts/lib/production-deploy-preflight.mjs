import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { productionAllowlistShapeProblemName } from "./allowed-google-emails-deploy.mjs";
import { isExactHttpsOrigin } from "./wrangler-d1-placeholders.mjs";
import {
  invalidProductionWorkerAuthSecretNames,
  missingProductionWorkerAuthSecretNames,
  MIN_PRODUCTION_BETTER_AUTH_SECRET_LENGTH,
  productionDeployBetterAuthSecretLengthProblemNames,
  PRODUCTION_WORKER_AUTH_SECRET_NAMES,
} from "./production-worker-auth-secrets.mjs";

export {
  MIN_PRODUCTION_BETTER_AUTH_SECRET_LENGTH,
  PRODUCTION_WORKER_AUTH_SECRET_NAMES,
};

const WRANGLER_SOURCE_ENV = "PHYSIO_WRANGLER_SOURCE_PATH";

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function resolveProductionWranglerSourcePath(env = process.env) {
  const override = env[WRANGLER_SOURCE_ENV]?.trim();
  if (override) {
    return resolve(override);
  }
  return resolve("wrangler.jsonc");
}

/**
 * @param {string} sourceText
 * @returns {string | null}
 */
export function readWebAppBaseUrlFromWranglerSource(sourceText) {
  const match = sourceText.match(/"WEB_APP_BASE_URL":\s*"([^"]+)"/);
  return match?.[1] ?? null;
}

/**
 * @param {string} wranglerSourceText
 * @returns {string[]}
 */
export function productionDeployWebAppBaseUrlProblemNames(wranglerSourceText) {
  const value = readWebAppBaseUrlFromWranglerSource(wranglerSourceText);
  if (!value || !isExactHttpsOrigin(value)) {
    return ["WEB_APP_BASE_URL"];
  }
  return [];
}

/**
 * @param {NodeJS.ProcessEnv} env
 * @param {string} wranglerSourceText
 * @returns {string[]}
 */
export function collectProductionDeployPreflightErrorLines(env, wranglerSourceText) {
  /** @type {string[]} */
  const lines = [];

  for (const name of invalidProductionWorkerAuthSecretNames(env)) {
    lines.push(`${name} must be a single line for production deploy.`);
  }
  if (lines.length > 0) {
    return lines;
  }

  for (const name of missingProductionWorkerAuthSecretNames(env)) {
    lines.push(`${name} is required for production deploy.`);
  }
  if (lines.length > 0) {
    return lines;
  }

  for (const name of productionDeployBetterAuthSecretLengthProblemNames(env)) {
    lines.push(
      `${name} must be at least ${MIN_PRODUCTION_BETTER_AUTH_SECRET_LENGTH} characters for production deploy.`,
    );
  }
  if (lines.length > 0) {
    return lines;
  }

  const allowlistProblem = productionAllowlistShapeProblemName(
    env.PHYSIO_ALLOWED_GOOGLE_EMAILS,
  );
  if (allowlistProblem) {
    lines.push(`${allowlistProblem} is invalid for production deploy.`);
    return lines;
  }

  for (const name of productionDeployWebAppBaseUrlProblemNames(wranglerSourceText)) {
    lines.push(`${name} must be an https origin for production deploy.`);
  }

  return lines;
}

/**
 * @param {NodeJS.ProcessEnv} [env]
 * @returns {string}
 */
export function loadProductionWranglerSourceText(env = process.env) {
  const path = resolveProductionWranglerSourcePath(env);
  return readFileSync(path, "utf8");
}
