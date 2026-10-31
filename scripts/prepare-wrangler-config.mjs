#!/usr/bin/env node
/**
 * Substitute production deploy placeholders and write a deploy-ready Wrangler config.
 *
 * Environment:
 *   PHYSIO_D1_DATABASE_ID — production D1 database id (GitHub production environment secret)
 *   PHYSIO_PRODUCTION_WEB_APP_BASE_URL — public https origin (GitHub production environment variable)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  D1_PLACEHOLDER_PRODUCTION,
  PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV,
  WEB_APP_BASE_URL_PLACEHOLDER,
} from "./lib/wrangler-d1-placeholders.mjs";

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
  if (text.includes(WEB_APP_BASE_URL_PLACEHOLDER)) {
    console.error("Failed to substitute production WEB_APP_BASE_URL placeholder.");
    process.exit(1);
  }
}

function resolveProductionWebAppBaseUrl(raw) {
  const trimmed = raw?.trim();
  if (!trimmed) {
    console.error(`${PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV} is required.`);
    process.exit(1);
  }
  if (trimmed === WEB_APP_BASE_URL_PLACEHOLDER) {
    console.error(
      `${PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV} must not be the committed placeholder.`,
    );
    process.exit(1);
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    console.error(
      `${PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV} must be a valid https URL.`,
    );
    process.exit(1);
  }
  if (parsed.protocol !== "https:") {
    console.error(`${PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV} must use https.`);
    process.exit(1);
  }
  return trimmed.replace(/\/$/, "");
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
  const webAppBaseUrl = resolveProductionWebAppBaseUrl(
    process.env[PHYSIO_PRODUCTION_WEB_APP_BASE_URL_ENV],
  );
  const sourceText = readFileSync(SOURCE, "utf8");
  let text = sourceText.replaceAll(D1_PLACEHOLDER_PRODUCTION, productionId);
  text = text.replaceAll(WEB_APP_BASE_URL_PLACEHOLDER, webAppBaseUrl);
  assertNoPlaceholderLeft(text);
  writeFileSync(output, text, "utf8");
}

main();
