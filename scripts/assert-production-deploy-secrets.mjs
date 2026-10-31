#!/usr/bin/env node
import {
  collectProductionDeployPreflightErrorLines,
  loadProductionWranglerSourceText,
} from "./lib/production-deploy-preflight.mjs";

function main() {
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

main();
