#!/usr/bin/env npx tsx
/**
 * Lists write-tool JSON Schema fields with no description and omitted tool descriptions.
 * Run: npx tsx scripts/list-mcp-write-schema-omissions.ts
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { buildWriteSchemaOmissionsMarkdown } from "../src/mcp-connector/write-schema-omissions.js";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");

function main(): void {
  const { markdown } = buildWriteSchemaOmissionsMarkdown();
  const docDir = join(ROOT, "docs/mcp-connector");
  mkdirSync(docDir, { recursive: true });
  const outPath = join(docDir, "write-schema-omitted-descriptions.md");
  writeFileSync(outPath, markdown);
  console.log(markdown);
}

const isMain =
  process.argv[1] !== undefined && fileURLToPath(import.meta.url) === process.argv[1];
if (isMain) {
  main();
}
