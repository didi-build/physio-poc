#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { buildWorkerAuthSecretsPayload } from "./lib/production-worker-auth-secrets.mjs";

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

function main() {
  const { config } = parseArgs(process.argv.slice(2));
  let payload;
  try {
    payload = buildWorkerAuthSecretsPayload(process.env);
  } catch (err) {
    const missing = err.missing;
    if (
      err.code === "MISSING_PRODUCTION_WORKER_AUTH_SECRETS" &&
      Array.isArray(missing)
    ) {
      for (const name of missing) {
        console.error(`${name} is required for production deploy.`);
      }
      process.exit(1);
    }
    throw err;
  }

  const wranglerBin = resolve(
    fileURLToPath(new URL("../node_modules/wrangler/bin/wrangler.js", import.meta.url)),
  );
  const json = `${JSON.stringify(payload)}\n`;
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

main();
