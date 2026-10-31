#!/usr/bin/env node
import {
  invalidProductionWorkerAuthSecretNames,
  missingProductionWorkerAuthSecretNames,
} from "./lib/production-worker-auth-secrets.mjs";

function main() {
  const invalid = invalidProductionWorkerAuthSecretNames(process.env);
  if (invalid.length > 0) {
    for (const name of invalid) {
      console.error(`${name} must be a single line for production deploy.`);
    }
    process.exit(1);
  }
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
