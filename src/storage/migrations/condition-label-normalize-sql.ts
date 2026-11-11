/**
 * SQLite/D1 expression matching normalizeConditionLabelKey (trim, lower, collapse whitespace).
 * Keep migrations/0009_routine_conditions.sql UPDATE in sync with buildConditionLabelNormalizedSqlExpr.
 */
export const CONDITION_LABEL_COLLAPSE_PASSES = 40;

export function buildConditionLabelNormalizedSqlExpr(columnRef = "label"): string {
  let expr = `replace(replace(replace(replace(replace(${columnRef}, char(9), ' '), char(10), ' '), char(13), ' '), char(11), ' '), char(12), ' ')`;
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
