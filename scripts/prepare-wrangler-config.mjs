#!/usr/bin/env node
/**
 * Substitute the production D1 database_id placeholder, attach the production R2
 * binding, and write a deploy-ready Wrangler config.
 *
 * Environment:
 *   PHYSIO_D1_DATABASE_ID — production D1 database id (GitHub production environment secret)
 */
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  COMMITTED_WEB_APP_BASE_URL,
  D1_PLACEHOLDER_PRODUCTION,
  isExactHttpsOrigin,
} from "./lib/wrangler-d1-placeholders.mjs";
import { LOWERCASE_CANONICAL_UUID_RE } from "./lib/lowercase-canonical-uuid.mjs";
import { PHYSIO_PRODUCTION_R2_BUCKETS } from "./lib/wrangler-r2-binding.mjs";
import { parse as parseJsonc, printParseErrorCode } from "jsonc-parser";

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

function assertCommittedWebAppBaseUrlInSource(sourceText) {
  const match = sourceText.match(/"WEB_APP_BASE_URL":\s*"([^"]+)"/);
  const value = match?.[1];
  if (!value || value !== COMMITTED_WEB_APP_BASE_URL || !isExactHttpsOrigin(value)) {
    console.error(
      "WEB_APP_BASE_URL in wrangler.jsonc must be the committed production https origin.",
    );
    process.exit(1);
  }
}

function readProductionId() {
  const raw = process.env.PHYSIO_D1_DATABASE_ID;
  if (raw === undefined || raw === "") {
    console.error("PHYSIO_D1_DATABASE_ID is required.");
    process.exit(1);
  }
  if (/[\r\n]/.test(raw)) {
    console.error("PHYSIO_D1_DATABASE_ID must not contain newline characters.");
    process.exit(1);
  }
  const trimmed = raw.trim();
  if (raw !== trimmed) {
    console.error(
      "PHYSIO_D1_DATABASE_ID must not contain leading or trailing whitespace.",
    );
    process.exit(1);
  }
  if (trimmed === D1_PLACEHOLDER_PRODUCTION) {
    console.error("PHYSIO_D1_DATABASE_ID must not be the committed placeholder.");
    process.exit(1);
  }
  if (!LOWERCASE_CANONICAL_UUID_RE.test(trimmed)) {
    console.error("PHYSIO_D1_DATABASE_ID must be a lowercase UUID.");
    process.exit(1);
  }
  return trimmed;
}

function parseWranglerConfig(text) {
  const errors = [];
  const parsed = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    const message = errors.map((entry) => printParseErrorCode(entry.error)).join(", ");
    console.error(`Failed to parse wrangler.jsonc: ${message}`);
    process.exit(1);
  }
  if (
    parsed === undefined ||
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    console.error("Expected wrangler.jsonc root object.");
    process.exit(1);
  }
  return parsed;
}

function assertCommittedConfigHasNoR2Binding(config) {
  if (config.r2_buckets !== undefined) {
    console.error("Committed wrangler.jsonc must not declare r2_buckets.");
    process.exit(1);
  }
}

function main() {
  const { output } = parseArgs(process.argv.slice(2));
  const productionId = readProductionId();
  const sourceText = readFileSync(SOURCE, "utf8");
  assertCommittedWebAppBaseUrlInSource(sourceText);
  const text = sourceText.replaceAll(D1_PLACEHOLDER_PRODUCTION, productionId);
  assertNoPlaceholderLeft(text);
  const config = parseWranglerConfig(text);
  assertCommittedConfigHasNoR2Binding(config);
  config.r2_buckets = PHYSIO_PRODUCTION_R2_BUCKETS;
  writeFileSync(output, `${JSON.stringify(config, null, 2)}\n`, "utf8");
}

main();
