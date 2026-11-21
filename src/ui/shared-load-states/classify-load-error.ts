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
  if (error instanceof Error) {
    const message = error.message.toLowerCase();
    if (message.endsWith("_not_found") || message === "not_found") {
      return true;
    }
  }
  return false;
}
