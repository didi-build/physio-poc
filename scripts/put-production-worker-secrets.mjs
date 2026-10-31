#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import {
  collectProductionDeployPreflightErrorLines,
  loadProductionWranglerSourceText,
} from "./lib/production-deploy-preflight.mjs";
import {
  buildWorkerAuthSecretsPayload,
  invalidProductionWorkerAuthSecretNames,
  missingProductionWorkerAuthSecretNames,
  serializeWorkerAuthSecretsBulkPayload,
} from "./lib/production-worker-auth-secrets.mjs";

function usage() {
  console.error("Usage: put-production-worker-secrets.mjs --config <wrangler.jsonc>");
  process.exit(1);
}

function parseArgs(argv) {
  let config = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--config") config = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!config) usage();
  return { config: resolve(config) };
}

function resolveWranglerJsPath(env = process.env) {
  const override = env.PHYSIO_WRANGLER_JS_PATH?.trim();
  if (override) {
    return resolve(override);
  }
  return resolve(
    fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  );
}

function reportSecretProblemsAndExit() {
  const invalid = invalidProductionWorkerAuthSecretNames(process.env);
  if (invalid.length > 0) {
    for (const name of invalid) {
      console.error(`${name} must be a single line for production deploy.`);
    }
    process.exit(1);
  }
  const missing = missingProductionWorkerAuthSecretNames(process.env);
  if (missing.length > 0) {
    for (const name of missing) {
      console.error(`${name} is required for production deploy.`);
    }
    process.exit(1);
  }
}

function assertProductionDeployPreflightOrExit() {
  const wranglerSource = loadProductionWranglerSourceText(process.env);
  const errors = collectProductionDeployPreflightErrorLines(
    process.env,
    wranglerSource,
  );
  if (errors.length > 0) {
    for (const line of errors) {
      console.error(line);
    }
    process.exit(1);
  }
}

function main() {
  const { config } = parseArgs(process.argv.slice(2));
  assertProductionDeployPreflightOrExit();
  let payload;
  try {
    payload = buildWorkerAuthSecretsPayload(process.env);
  } catch (err) {
    if (
      err.code === "INVALID_PRODUCTION_WORKER_AUTH_SECRETS" &&
      Array.isArray(err.invalid)
    ) {
      for (const name of err.invalid) {
        console.error(`${name} must be a single line for production deploy.`);
      }
      process.exit(1);
    }
    if (
      err.code === "MISSING_PRODUCTION_WORKER_AUTH_SECRETS" &&
      Array.isArray(err.missing)
    ) {
      reportSecretProblemsAndExit();
    }
    throw err;
  }

  const wranglerBin = resolveWranglerJsPath(process.env);
  const json = serializeWorkerAuthSecretsBulkPayload(payload);
  const result = spawnSync(
    process.execPath,
    [wranglerBin, "secret", "bulk", "--config", config],
    {
      env: process.env,
      input: json,
      stdio: ["pipe", "inherit", "inherit"],
    },
  );
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

const isMain =
  process.argv[1] !== undefined &&
  fileURLToPath(import.meta.url) === resolve(process.argv[1]);

if (isMain) {
  main();
}
