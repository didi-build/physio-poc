/** Session-only programs API (DIDI-1122). */
import type { ProgramOriginFilter } from "./services/programs/types.js";

export const PROGRAMS_API_BASE = "/api/me/programs";

export function programsCollectionPath(
  searchQuery?: string,
  origin?: ProgramOriginFilter,
): string {
  const params = new URLSearchParams();
  const trimmed = searchQuery?.trim();
  if (trimmed && trimmed.length > 0) {
    params.set("q", trimmed);
  }
  if (origin && origin !== "all") {
    params.set("origin", origin);
  }
  const query = params.toString();
  if (query.length === 0) {
    return PROGRAMS_API_BASE;
  }
  return `${PROGRAMS_API_BASE}?${query}`;
}

export function programByCodePath(programCode: string): string {
  return `${PROGRAMS_API_BASE}/by-code/${encodeURIComponent(programCode.trim())}`;
}

export function programsDeletedListPath(): string {
  return `${PROGRAMS_API_BASE}/deleted`;
}

export function programPath(programId: string): string {
  return `${PROGRAMS_API_BASE}/${encodeURIComponent(programId)}`;
}

export function programRestorePath(programId: string): string {
  return `${programPath(programId)}/restore`;
}

export function programRowsPath(programId: string): string {
  return `${programPath(programId)}/rows`;
}

export function programRowPath(programId: string, rowId: string): string {
  return `${programRowsPath(programId)}/${encodeURIComponent(rowId)}`;
}

export function programRowsReorderPath(programId: string): string {
  return `${programRowsPath(programId)}/reorder`;
}

export function programRowDuplicatePath(programId: string, rowId: string): string {
  return `${programRowPath(programId, rowId)}/duplicate`;
}

export function programRowLibraryUpdateApplyPath(
  programId: string,
  rowId: string,
): string {
  return `${programRowPath(programId, rowId)}/library-update/apply`;
}

export function programRowLibraryUpdateKeepPath(
  programId: string,
  rowId: string,
): string {
  return `${programRowPath(programId, rowId)}/library-update/keep`;
}

export function programsFromRoutinePath(): string {
  return `${PROGRAMS_API_BASE}/from-routine`;
}

export function programPublishPath(programId: string): string {
  return `${programPath(programId)}/publish`;
}

export function programShareLinkPath(programId: string): string {
  return `${programPath(programId)}/share-link`;
}

export function publicShareLinkApiPath(token: string): string {
  return `/api/public/share-links/${encodeURIComponent(token.trim())}`;
}
