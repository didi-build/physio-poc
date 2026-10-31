#!/usr/bin/env node
import { missingProductionWorkerAuthSecretNames } from "./lib/production-worker-auth-secrets.mjs";

function main() {
  const missing = missingProductionWorkerAuthSecretNames(process.env);
  if (missing.length === 0) {
    return;
  }
  for (const name of missing) {
    console.error(`${name} is required for production deploy.`);
  }
  process.exit(1);
}

main();
