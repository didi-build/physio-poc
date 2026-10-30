export const PROGRAMS_API_BASE = "/api/me/programs";

export function programsCollectionPath(searchQuery?: string): string {
  if (!searchQuery) {
    return PROGRAMS_API_BASE;
  }
  const params = new URLSearchParams({ q: searchQuery });
  return `${PROGRAMS_API_BASE}?${params.toString()}`;
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
