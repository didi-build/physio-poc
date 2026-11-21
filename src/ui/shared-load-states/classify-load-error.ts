/** Distinguish missing resource from transport/load failure (spec not-found vs item error). */

export function isLoadNotFoundError(error: unknown): boolean {
  if (error === null || error === undefined) {
    return false;
  }
  const code =
    typeof error === "object" && error !== null && "code" in error
      ? String((error as { code: unknown }).code).toLowerCase()
      : "";
  if (code.endsWith("_not_found") || code === "not_found") {
    return true;
  }
  const message =
    error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const normalized = message.toLowerCase();
  return (
    normalized.includes("not_found") ||
    normalized.includes("not found") ||
    /\b404\b/.test(normalized)
  );
}
