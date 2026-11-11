/**
 * SQLite/D1 expression matching normalizeConditionLabelKey (trim, lower, collapse whitespace).
 * Maps every BMP code point that JavaScript /\s/ matches to ASCII space before trim/lower/collapse.
 * Keep migrations/0009_routine_conditions.sql UPDATE in sync via scripts/sync-0009-condition-label-normalize.mjs.
 */
export const CONDITION_LABEL_COLLAPSE_PASSES = 40;

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

export function buildConditionLabelNormalizedSqlExpr(columnRef = "label"): string {
  let expr = columnRef;
  for (const cp of CONDITION_LABEL_JS_WHITESPACE_CODE_POINTS) {
    expr = `replace(${expr}, char(${cp}), ' ')`;
  }
  expr = `lower(trim(${expr}))`;
  for (let pass = 0; pass < CONDITION_LABEL_COLLAPSE_PASSES; pass += 1) {
    expr = `replace(${expr}, '  ', ' ')`;
  }
  return expr;
}

export function buildConditionLabelNormalizedBackfillUpdateSql(): string {
  const expr = buildConditionLabelNormalizedSqlExpr("label");
  return `UPDATE conditions
SET label_normalized = ${expr}
WHERE label IS NOT NULL
  AND label_normalized IS NULL`;
}
