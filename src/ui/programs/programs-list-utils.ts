import type { ProgramListItem } from "../../services/programs/types.js";
import type { ProgramSearchResult } from "../../services/programs/types.js";

/** Accept only when matched_code and an item code both equal the URL segment exactly. */
export function resolveProgramIdForBuilderCode(
  result: ProgramSearchResult,
  urlCode: string,
): string | null {
  const code = urlCode.trim();
  if (code.length === 0) {
    return null;
  }
  if (result.matched_code !== code) {
    return null;
  }
  const item = result.items.find((entry) => entry.code === code);
  return item?.program_id ?? null;
}

export function filterProgramsClientSide(
  items: ProgramListItem[],
  query: string,
): ProgramListItem[] {
  const trimmed = query.trim().toLowerCase();
  if (trimmed.length === 0) {
    return items;
  }
  return items.filter((item) => {
    const name = (item.name ?? "").toLowerCase();
    const code = item.code.toLowerCase();
    const codeNoPrefix = code.replace(/^prg-/, "");
    const queryNoPrefix = trimmed.replace(/^prg-/, "");
    return (
      name.includes(trimmed) ||
      code.includes(trimmed) ||
      codeNoPrefix.includes(queryNoPrefix)
    );
  });
}

export function highlightMatchedCode(
  code: string,
  matchedCode: string | null,
): { before: string; match: string; after: string } | null {
  if (!matchedCode || matchedCode.length === 0) {
    return null;
  }
  const index = code.toLowerCase().indexOf(matchedCode.toLowerCase());
  if (index < 0) {
    return null;
  }
  return {
    before: code.slice(0, index),
    match: code.slice(index, index + matchedCode.length),
    after: code.slice(index + matchedCode.length),
  };
}
