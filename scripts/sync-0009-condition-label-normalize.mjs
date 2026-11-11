#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { buildConditionLabelNormalizationMigrationDmlSql } from "../src/storage/migrations/condition-label-normalize-sql.ts";

const path = "migrations/0009_routine_conditions.sql";
const text = readFileSync(path, "utf8");
const marker = "-- Matches normalizeConditionLabelKey";
const start = text.indexOf(marker);
const end = text.indexOf("CREATE UNIQUE INDEX");
if (start < 0 || end < 0) {
  throw new Error(`${path}: could not find label normalization DML block markers`);
}
const next =
  text.slice(0, start) +
  "-- Matches normalizeConditionLabelKey (see condition-label-normalize-sql.ts).\n" +
  "-- Non-ASCII fail-closed: temporary-table CHECK guard before UPDATE (case folding not mirrored).\n" +
  `${buildConditionLabelNormalizationMigrationDmlSql()}\n\n` +
  text.slice(end);
writeFileSync(path, next);
