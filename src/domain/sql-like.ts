/** Escape user text for SQL LIKE with ESCAPE '\\'. */
export function likeContainsPattern(raw: string): string {
  const escaped = raw.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_");
  return `%${escaped}%`;
}

export const SQL_LIKE_ESCAPE = "\\";
