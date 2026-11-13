import type { PublishedProgramSnapshot } from "../../domain/program-types.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  ProgramsRepository,
  ShareLinksRepository,
  type ShareLinkRecord,
} from "../../storage/repositories/programs.js";

function linkIsExpired(link: ShareLinkRecord, requestTime: Date): boolean {
  if (link.expires_at === null) {
    return false;
  }
  return new Date(link.expires_at).getTime() <= requestTime.getTime();
}

export type GatedPublicShareLinkContext = {
  snapshot: PublishedProgramSnapshot;
  link: ShareLinkRecord;
};

/** Open, non-expired share link with a published snapshot; null when any gate fails. */
export async function loadGatedPublicShareLinkContext(
  sql: SqlStoragePort,
  token: string,
  requestTime: Date = new Date(),
): Promise<GatedPublicShareLinkContext | null> {
  const trimmed = token.trim();
  if (trimmed.length === 0) {
    return null;
  }
  const links = new ShareLinksRepository(sql);
  const link = await links.findByToken(trimmed);
  if (!link) {
    return null;
  }
  if (link.closed_at !== null) {
    return null;
  }
  if (linkIsExpired(link, requestTime)) {
    return null;
  }

  const programs = new ProgramsRepository(sql);
  const program = await programs.findById(link.program_id);
  if (!program || program.deleted_at) {
    return null;
  }
  const snapshot = programs.getPublishedSnapshot(program);
  if (!snapshot) {
    return null;
  }

  const openLink = await links.findOpenByProgramId(program.id);
  if (!openLink || openLink.id !== link.id) {
    return null;
  }

  return { snapshot, link };
}
