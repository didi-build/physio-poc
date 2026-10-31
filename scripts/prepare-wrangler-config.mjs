#!/usr/bin/env node
/**
 * Substitute the production D1 database_id placeholder and write a deploy-ready Wrangler config.
 *
 * Environment:
 *   PHYSIO_D1_DATABASE_ID — production D1 database id (GitHub production environment secret)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { D1_PLACEHOLDER_PRODUCTION } from "./lib/wrangler-d1-placeholders.mjs";

const SOURCE = resolve("wrangler.jsonc");

function usage() {
  console.error("Usage: prepare-wrangler-config.mjs --output <path>");
  process.exit(1);
}

function parseArgs(argv) {
  let output = null;
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--output") output = argv[++i];
    else {
      console.error(`Unknown argument: ${arg}`);
      usage();
    }
  }
  if (!output) usage();
  return { output: resolve(output) };
}

function assertNoPlaceholderLeft(text) {
  if (text.includes(D1_PLACEHOLDER_PRODUCTION)) {
    console.error("Failed to substitute production D1 database_id placeholder.");
    process.exit(1);
  }
}

function main() {
  const { output } = parseArgs(process.argv.slice(2));
  const productionId = process.env.PHYSIO_D1_DATABASE_ID?.trim();
  if (!productionId) {
    console.error("PHYSIO_D1_DATABASE_ID is required.");
    process.exit(1);
  }
  if (productionId === D1_PLACEHOLDER_PRODUCTION) {
    console.error("PHYSIO_D1_DATABASE_ID must not be the committed placeholder.");
    process.exit(1);
  }
  const sourceText = readFileSync(SOURCE, "utf8");
  const text = sourceText.replaceAll(D1_PLACEHOLDER_PRODUCTION, productionId);
  assertNoPlaceholderLeft(text);
  writeFileSync(output, text, "utf8");
}

main();
