/**
 * SQLite/D1 expression matching normalizeConditionLabelKey (trim, lower, collapse whitespace).
 * Maps every BMP code point that JavaScript /\s/ matches to ASCII space before trim/lower/collapse.
 * Non-ASCII letters fail closed via temporary-table CHECK (SQLite `lower()` is ASCII-only).
 * Keep migrations/0009_routine_conditions.sql DML in sync via scripts/sync-0009-condition-label-normalize.mjs.
 */
export const CONDITION_LABEL_COLLAPSE_PASSES = 40;

export const CONDITION_LABEL_NON_ASCII_GUARD_TABLE = "_didi_1217_label_non_ascii_guard";

function discoverJsWhitespaceCodePointsBmp(): number[] {
  const codes: number[] = [];
  for (let cp = 0; cp <= 0xffff; cp += 1) {
    if (/\s/.test(String.fromCharCode(cp))) {
      codes.push(cp);
    }
  }
  return codes;
}

/** BMP code points for which JavaScript `/\s/` is true (single-char strings). */
export const CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS: readonly number[] =
  discoverJsWhitespaceCodePointsBmp();

export function buildConditionLabelWhitespaceMappedSqlExpr(
  columnRef = "label",
): string {
  let expr = columnRef;
  for (const cp of CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS) {
    expr = `replace(${expr}, char(${cp}), ' ')`;
  }
  return expr;
}

export function buildConditionLabelNormalizedSqlExpr(columnRef = "label"): string {
  let expr = `lower(trim(${buildConditionLabelWhitespaceMappedSqlExpr(columnRef)}))`;
  for (let pass = 0; pass < CONDITION_LABEL_COLLAPSE_PASSES; pass += 1) {
    expr = `replace(${expr}, '  ', ' ')`;
  }
  return expr;
}

/**
 * Abort migration when any label still contains non-ASCII after whitespace mapping (GLOB).
 * Uses a scratch table + CHECK (not TEMP — D1 migrations reject TEMP objects with SQLITE_AUTH).
 */
export function buildConditionLabelNonAsciiGuardMigrationSql(): string {
  const mapped = buildConditionLabelWhitespaceMappedSqlExpr("label");
  return `CREATE TABLE ${CONDITION_LABEL_NON_ASCII_GUARD_TABLE} (
  offending_count INTEGER NOT NULL CHECK (offending_count = 0)
);

INSERT INTO ${CONDITION_LABEL_NON_ASCII_GUARD_TABLE} (offending_count)
SELECT COUNT(*)
FROM conditions
WHERE label IS NOT NULL
  AND ${mapped} GLOB '*[^ -~]*';

DROP TABLE ${CONDITION_LABEL_NON_ASCII_GUARD_TABLE};`;
}

export function buildConditionLabelNormalizedBackfillUpdateSql(): string {
  const expr = buildConditionLabelNormalizedSqlExpr("label");
  return `UPDATE conditions
SET label_normalized = ${expr}
WHERE label IS NOT NULL
  AND label_normalized IS NULL`;
}

export function buildConditionLabelNormalizationMigrationDmlSql(): string {
  return `${buildConditionLabelNonAsciiGuardMigrationSql()}\n\n${buildConditionLabelNormalizedBackfillUpdateSql()};`;
}
