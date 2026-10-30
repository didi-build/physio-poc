import type { SqlStoragePort } from "../ports/sql-storage.js";
import {
  PRESCRIPTION_TYPES,
  type PrescriptionType,
} from "../../domain/exercise-types.js";
import {
  validateOptionalProgramName,
  validateProgramName,
  validateProgramRowNote,
} from "../../domain/exercise-free-text.js";
import {
  parseExerciseParamsJson,
  validateExerciseParams,
  type ExerciseParams,
} from "../../domain/exercise-params.js";
import * as programCodeDomain from "../../domain/program-code.js";
import { validateProgramRowTextSnapshot } from "../../domain/program-row-text.js";
import {
  parseProgramRowTextSnapshotJson,
  parsePublishedProgramSnapshotJson,
  type ProgramRowSnapshot,
  type ProgramRowTextSnapshot,
  type PublishedProgramSnapshot,
} from "../../domain/program-types.js";
import { generateShareLinkToken } from "../../domain/share-link-token.js";
import {
  resolveShareLinkExpiresAt,
  validateShareLinkExpiryChoice,
  type ShareLinkExpiryChoice,
} from "../../domain/share-link-expiry.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import { likeContainsPattern } from "../../domain/sql-like.js";

export class ProgramRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProgramRepositoryError";
  }
}

export type ProgramRow = {
  id: string;
  program_id: string;
  position: number;
  exercise_id: string | null;
  exercise_version_id: string | null;
  exercise_request_id: string | null;
  prescription_type: PrescriptionType;
  params_json: string;
  text_snapshot_json: string;
  note: string | null;
};

export type ProgramRecord = {
  id: string;
  code: string;
  name: string | null;
  created_by: string;
  created_at: string;
  draft_version: number;
  draft_updated_at: string;
  published_version: number | null;
  published_name: string | null;
  published_at: string | null;
  published_snapshot_json: string | null;
  deleted_at: string | null;
  link_expires_in: ShareLinkExpiresIn | null;
  link_expires_on: string | null;
};

export const PROGRAM_RESTORE_AND_PURGE_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

function assertPrescriptionType(value: string): PrescriptionType {
  if ((PRESCRIPTION_TYPES as readonly string[]).includes(value)) {
    return value as PrescriptionType;
  }
  throw new ProgramRepositoryError(`Invalid prescription type: ${value}`);
}

function rowToSnapshot(row: ProgramRow): ProgramRowSnapshot {
  const textSnapshot = validateProgramRowTextSnapshot(
    parseProgramRowTextSnapshotJson(row.text_snapshot_json),
  );
  const note = validateProgramRowNote(row.note);
  return {
    position: row.position,
    exerciseId: row.exercise_id,
    exerciseVersionId: row.exercise_version_id,
    exerciseRequestId: row.exercise_request_id,
    prescriptionType: row.prescription_type,
    params: parseExerciseParamsJson(row.params_json),
    textSnapshot,
    note,
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return (
    message.includes("UNIQUE constraint failed") ||
    message.includes("idx_share_links_one_open_per_program") ||
    message.includes("idx_programs_code")
  );
}

function rethrowOpenShareLinkError(error: unknown): never {
  if (isUniqueConstraintError(error)) {
    throw new ProgramRepositoryError("Program already has an open share link");
  }
  throw error;
}

function purgeCutoffIso(now: Date): string {
  return new Date(now.getTime() - PROGRAM_RESTORE_AND_PURGE_WINDOW_MS).toISOString();
}

export class ProgramsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async create(input: {
    id: string;
    createdBy: string;
    createdAt: string;
    name?: string | null;
    code?: string;
  }): Promise<ProgramRecord> {
    const id = validateOpaqueEntityId(input.id, "Program id");
    const name = validateOptionalProgramName(input.name ?? null);
    let code = input.code
      ? programCodeDomain.normalizeProgramCode(input.code)
      : programCodeDomain.generateProgramCode();
    if (!programCodeDomain.isValidProgramCodeFormat(code)) {
      throw new ProgramRepositoryError("Program code format is invalid");
    }
    for (let attempt = 0; attempt < 8; attempt += 1) {
      try {
        await this.sql.run(
          `INSERT INTO programs (
            id, code, name, created_by, created_at,
            draft_version, draft_updated_at
          ) VALUES (?, ?, ?, ?, ?, 1, ?)`,
          [id, code, name, input.createdBy, input.createdAt, input.createdAt],
        );
        const created = await this.findById(id);
        if (!created) {
          throw new ProgramRepositoryError("Program insert failed");
        }
        return created;
      } catch (error) {
        if (input.code) {
          if (isUniqueConstraintError(error)) {
            throw new ProgramRepositoryError("Program code is already in use");
          }
          throw error;
        }
        if (isUniqueConstraintError(error) && attempt < 7) {
          code = programCodeDomain.generateProgramCode();
          continue;
        }
        throw error;
      }
    }
    throw new ProgramRepositoryError("Could not allocate a unique program code");
  }

  async findById(id: string): Promise<ProgramRecord | null> {
    return this.sql.first<ProgramRecord>(
      `SELECT id, code, name, created_by, created_at, draft_version, draft_updated_at,
              published_version, published_name, published_at, published_snapshot_json,
              deleted_at, link_expires_in, link_expires_on
       FROM programs WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  async findByCode(query: string): Promise<ProgramRecord | null> {
    const keys = programCodeDomain.programCodeSearchKeys(query);
    for (const key of keys) {
      const row = await this.sql.first<ProgramRecord>(
        `SELECT id, code, name, created_by, created_at, draft_version, draft_updated_at,
                published_version, published_name, published_at, published_snapshot_json,
                deleted_at, link_expires_in, link_expires_on
         FROM programs WHERE code = ? COLLATE NOCASE LIMIT 1`,
        [key],
      );
      if (row) {
        return row;
      }
    }
    return null;
  }

  async listForPractitioner(input: {
    practitionerId: string;
    searchQuery?: string;
    deletedOnly?: boolean;
    includeActive?: boolean;
  }): Promise<ProgramRecord[]> {
    const bindings: (string | number)[] = [input.practitionerId];
    const where: string[] = ["created_by = ?"];

    if (input.deletedOnly) {
      where.push("deleted_at IS NOT NULL");
    } else if (input.includeActive !== false) {
      where.push("deleted_at IS NULL");
    }

    const trimmed = input.searchQuery?.trim();
    if (trimmed) {
      const codeKeys = programCodeDomain.programCodeSearchKeys(trimmed);
      const nameLike = likeContainsPattern(trimmed);
      if (codeKeys.length > 0) {
        where.push(
          `(name LIKE ? ESCAPE '\\' COLLATE NOCASE OR code IN (${codeKeys.map(() => "?").join(", ")}))`,
        );
        bindings.push(nameLike, ...codeKeys);
      } else {
        where.push("name LIKE ? ESCAPE '\\' COLLATE NOCASE");
        bindings.push(nameLike);
      }
    }

    return this.sql.all<ProgramRecord>(
      `SELECT id, code, name, created_by, created_at, draft_version, draft_updated_at,
              published_version, published_name, published_at, published_snapshot_json,
              deleted_at, link_expires_in, link_expires_on
       FROM programs
       WHERE ${where.join(" AND ")}
       ORDER BY draft_updated_at DESC`,
      bindings,
    );
  }

  async updateDraftName(programId: string, name: string | null): Promise<void> {
    const validated = validateOptionalProgramName(name);
    const now = new Date().toISOString();
    await this.sql.run(
      `UPDATE programs SET name = ?, draft_updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [validated, now, programId],
    );
  }

  async setLinkExpiry(
    programId: string,
    choice: ShareLinkExpiryChoice,
    now: Date = new Date(),
  ): Promise<void> {
    const validated = validateShareLinkExpiryChoice(choice, now);
    await this.sql.run(
      `UPDATE programs SET link_expires_in = ?, link_expires_on = ? WHERE id = ? AND deleted_at IS NULL`,
      [validated.expiresIn, validated.customExpiresOn ?? null, programId],
    );
    const program = await this.findById(programId);
    if (!program || program.deleted_at) {
      return;
    }
    const open = await new ShareLinksRepository(this.sql).findOpenByProgramId(
      programId,
    );
    if (!open) {
      return;
    }
    const expiresAt = resolveShareLinkExpiresAt(validated, now);
    await this.sql.run(
      `UPDATE share_links SET expires_at = ? WHERE id = ? AND closed_at IS NULL`,
      [expiresAt, open.id],
    );
  }

  async touchDraft(programId: string, updatedAt: string): Promise<void> {
    await this.sql.run(
      `UPDATE programs SET draft_updated_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [updatedAt, programId],
    );
  }

  async publish(
    programId: string,
    publishedAt: string,
  ): Promise<PublishedProgramSnapshot> {
    const program = await this.findById(programId);
    if (!program || program.deleted_at) {
      throw new ProgramRepositoryError("Program not found");
    }
    const publishName = validateProgramName(program.name ?? "");
    const rows = await new ProgramRowsRepository(this.sql).listForProgram(programId);
    const snapshotRows = rows.map(rowToSnapshot);
    const payload: PublishedProgramSnapshot = {
      version: program.draft_version,
      name: publishName,
      publishedAt,
      rows: snapshotRows,
    };
    const snapshotJson = JSON.stringify(payload);
    await this.sql.run(
      `UPDATE programs SET
        published_version = draft_version,
        published_name = ?,
        published_at = ?,
        published_snapshot_json = ?,
        draft_updated_at = ?
       WHERE id = ? AND deleted_at IS NULL`,
      [publishName, publishedAt, snapshotJson, publishedAt, programId],
    );
    return payload;
  }

  getPublishedSnapshot(program: ProgramRecord): PublishedProgramSnapshot | null {
    if (!program.published_snapshot_json) {
      return null;
    }
    return parsePublishedProgramSnapshotJson(program.published_snapshot_json);
  }

  async softDelete(programId: string, deletedAt: string): Promise<void> {
    await new ShareLinksRepository(this.sql).closeOpenLinksForProgram(
      programId,
      deletedAt,
    );
    await this.sql.run(
      `UPDATE programs SET deleted_at = ? WHERE id = ? AND deleted_at IS NULL`,
      [deletedAt, programId],
    );
  }

  async restore(programId: string, now: Date = new Date()): Promise<void> {
    const program = await this.findById(programId);
    if (!program?.deleted_at) {
      throw new ProgramRepositoryError("Program is not deleted");
    }
    const deletedMs = Date.parse(program.deleted_at);
    if (Number.isNaN(deletedMs)) {
      throw new ProgramRepositoryError("Invalid deleted_at timestamp");
    }
    if (now.getTime() - deletedMs > PROGRAM_RESTORE_AND_PURGE_WINDOW_MS) {
      throw new ProgramRepositoryError("Restore window has expired");
    }
    await this.sql.run(`UPDATE programs SET deleted_at = NULL WHERE id = ?`, [
      programId,
    ]);
  }

  async listPurgeableDeleted(now: Date = new Date()): Promise<ProgramRecord[]> {
    const cutoff = purgeCutoffIso(now);
    return this.sql.all<ProgramRecord>(
      `SELECT id, code, name, created_by, created_at, draft_version, draft_updated_at,
              published_version, published_name, published_at, published_snapshot_json,
              deleted_at, link_expires_in, link_expires_on
       FROM programs
       WHERE deleted_at IS NOT NULL AND deleted_at < ?`,
      [cutoff],
    );
  }

  async purgeDeleted(programId: string, now: Date = new Date()): Promise<void> {
    const cutoff = purgeCutoffIso(now);
    await this.sql.run(
      `DELETE FROM share_links
       WHERE program_id = ?
         AND program_id IN (
           SELECT id FROM programs
           WHERE id = ? AND deleted_at IS NOT NULL AND deleted_at < ?
         )`,
      [programId, programId, cutoff],
    );
    await this.sql.run(
      `DELETE FROM program_rows
       WHERE program_id = ?
         AND program_id IN (
           SELECT id FROM programs
           WHERE id = ? AND deleted_at IS NOT NULL AND deleted_at < ?
         )`,
      [programId, programId, cutoff],
    );
    await this.sql.run(
      `DELETE FROM programs
       WHERE id = ? AND deleted_at IS NOT NULL AND deleted_at < ?`,
      [programId, cutoff],
    );
  }
}

export class ProgramRowsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async replaceRow(input: {
    id: string;
    programId: string;
    position: number;
    exerciseId?: string | null;
    exerciseVersionId?: string | null;
    exerciseRequestId?: string | null;
    prescriptionType: PrescriptionType;
    params: ExerciseParams;
    textSnapshot: ProgramRowTextSnapshot;
    note?: string | null;
    draftUpdatedAt: string;
    touchDraft?: boolean;
  }): Promise<void> {
    const rowId = validateOpaqueEntityId(input.id, "Program row id");
    const program = await new ProgramsRepository(this.sql).findById(input.programId);
    if (!program || program.deleted_at) {
      throw new ProgramRepositoryError("Program not found");
    }
    const textSnapshot = validateProgramRowTextSnapshot(input.textSnapshot);
    const paramsJson = JSON.stringify(validateExerciseParams(input.params));
    const textJson = JSON.stringify(textSnapshot);
    const note = validateProgramRowNote(input.note ?? null);
    const hasPlaceholder = Boolean(input.exerciseRequestId);
    const exerciseRequestId = input.exerciseRequestId
      ? validateOpaqueEntityId(input.exerciseRequestId, "Exercise request id")
      : null;
    if (hasPlaceholder) {
      if (input.exerciseId || input.exerciseVersionId) {
        throw new ProgramRepositoryError(
          "Placeholder rows must not reference an exercise version",
        );
      }
    } else if (!input.exerciseId || !input.exerciseVersionId) {
      throw new ProgramRepositoryError(
        "Exercise rows require exercise_id and exercise_version_id",
      );
    }

    await this.sql.run(
      `INSERT INTO program_rows (
        id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
        prescription_type, params_json, text_snapshot_json, note
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(program_id, position) DO UPDATE SET
        exercise_id = excluded.exercise_id,
        exercise_version_id = excluded.exercise_version_id,
        exercise_request_id = excluded.exercise_request_id,
        prescription_type = excluded.prescription_type,
        params_json = excluded.params_json,
        text_snapshot_json = excluded.text_snapshot_json,
        note = excluded.note`,
      [
        rowId,
        input.programId,
        input.position,
        input.exerciseId ?? null,
        input.exerciseVersionId ?? null,
        exerciseRequestId,
        input.prescriptionType,
        paramsJson,
        textJson,
        note,
      ],
    );
    if (input.touchDraft !== false) {
      await new ProgramsRepository(this.sql).touchDraft(
        input.programId,
        input.draftUpdatedAt,
      );
    }
  }

  async listForProgram(programId: string): Promise<ProgramRow[]> {
    const rows = await this.sql.all<ProgramRow>(
      `SELECT id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
              prescription_type, params_json, text_snapshot_json, note
       FROM program_rows WHERE program_id = ? ORDER BY position ASC`,
      [programId],
    );
    return rows.map((row) => ({
      ...row,
      prescription_type: assertPrescriptionType(row.prescription_type),
    }));
  }

  async listForExerciseRequestId(exerciseRequestId: string): Promise<ProgramRow[]> {
    const rows = await this.sql.all<ProgramRow>(
      `SELECT id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
              prescription_type, params_json, text_snapshot_json, note
       FROM program_rows
       WHERE exercise_request_id = ?
       ORDER BY program_id ASC, position ASC`,
      [exerciseRequestId],
    );
    return rows.map((row) => ({
      ...row,
      prescription_type: assertPrescriptionType(row.prescription_type),
    }));
  }

  async findById(rowId: string): Promise<ProgramRow | null> {
    const row = await this.sql.first<ProgramRow>(
      `SELECT id, program_id, position, exercise_id, exercise_version_id, exercise_request_id,
              prescription_type, params_json, text_snapshot_json, note
       FROM program_rows WHERE id = ? LIMIT 1`,
      [rowId],
    );
    if (!row) {
      return null;
    }
    return {
      ...row,
      prescription_type: assertPrescriptionType(row.prescription_type),
    };
  }

  async deleteRow(
    programId: string,
    rowId: string,
    draftUpdatedAt: string,
  ): Promise<void> {
    const program = await new ProgramsRepository(this.sql).findById(programId);
    if (!program || program.deleted_at) {
      throw new ProgramRepositoryError("Program not found");
    }
    const rows = await this.listForProgram(programId);
    const target = rows.find((row) => row.id === rowId);
    if (!target) {
      throw new ProgramRepositoryError("Program row not found");
    }
    await this.sql.run(`DELETE FROM program_rows WHERE id = ? AND program_id = ?`, [
      rowId,
      programId,
    ]);
    const remaining = rows
      .filter((row) => row.id !== rowId)
      .sort((a, b) => a.position - b.position);
    await this.applyPositions(
      programId,
      remaining.map((row) => row.id),
    );
    await new ProgramsRepository(this.sql).touchDraft(programId, draftUpdatedAt);
  }

  async reorderRows(
    programId: string,
    orderedRowIds: string[],
    draftUpdatedAt: string,
  ): Promise<void> {
    const program = await new ProgramsRepository(this.sql).findById(programId);
    if (!program || program.deleted_at) {
      throw new ProgramRepositoryError("Program not found");
    }
    const rows = await this.listForProgram(programId);
    if (orderedRowIds.length !== rows.length) {
      throw new ProgramRepositoryError("Reorder must include every program row");
    }
    const idSet = new Set(rows.map((row) => row.id));
    for (const rowId of orderedRowIds) {
      if (!idSet.has(rowId)) {
        throw new ProgramRepositoryError("Reorder includes an unknown row id");
      }
    }
    if (new Set(orderedRowIds).size !== orderedRowIds.length) {
      throw new ProgramRepositoryError("Reorder row ids must be unique");
    }
    await this.applyPositions(programId, orderedRowIds);
    await new ProgramsRepository(this.sql).touchDraft(programId, draftUpdatedAt);
  }

  private async applyPositions(
    programId: string,
    orderedRowIds: string[],
  ): Promise<void> {
    for (let i = 0; i < orderedRowIds.length; i += 1) {
      await this.sql.run(
        `UPDATE program_rows SET position = ? WHERE id = ? AND program_id = ?`,
        [1_000_000 + i, orderedRowIds[i], programId],
      );
    }
    for (let i = 0; i < orderedRowIds.length; i += 1) {
      await this.sql.run(
        `UPDATE program_rows SET position = ? WHERE id = ? AND program_id = ?`,
        [i, orderedRowIds[i], programId],
      );
    }
  }
}

export type ShareLinkRecord = {
  id: string;
  program_id: string;
  token: string;
  expires_at: string | null;
  closed_at: string | null;
  created_at: string;
};

export class ShareLinksRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async findOpenByProgramId(programId: string): Promise<ShareLinkRecord | null> {
    return this.sql.first<ShareLinkRecord>(
      `SELECT id, program_id, token, expires_at, closed_at, created_at
       FROM share_links
       WHERE program_id = ? AND closed_at IS NULL
       LIMIT 1`,
      [programId],
    );
  }

  async createOpenLink(input: {
    id: string;
    programId: string;
    createdAt: string;
    expiresAt: string | null;
    token?: string;
  }): Promise<ShareLinkRecord> {
    const linkId = validateOpaqueEntityId(input.id, "Share link id");
    const token = input.token ?? generateShareLinkToken();
    try {
      const result = await this.sql.run(
        `INSERT INTO share_links (id, program_id, token, expires_at, closed_at, created_at)
         SELECT ?, ?, ?, ?, NULL, ?
         FROM programs
         WHERE id = ? AND deleted_at IS NULL`,
        [
          linkId,
          input.programId,
          token,
          input.expiresAt,
          input.createdAt,
          input.programId,
        ],
      );
      if (result.rowsAffected === 0) {
        const program = await new ProgramsRepository(this.sql).findById(
          input.programId,
        );
        if (!program) {
          throw new ProgramRepositoryError("Program not found");
        }
        if (program.deleted_at) {
          throw new ProgramRepositoryError("Program is deleted");
        }
        throw new ProgramRepositoryError("Share link insert failed");
      }
    } catch (error) {
      if (error instanceof ProgramRepositoryError) {
        throw error;
      }
      rethrowOpenShareLinkError(error);
    }
    const created = await this.findOpenByProgramId(input.programId);
    if (!created) {
      throw new ProgramRepositoryError("Share link insert failed");
    }
    return created;
  }

  async closeOpenLinksForProgram(programId: string, closedAt: string): Promise<void> {
    await this.sql.run(
      `UPDATE share_links SET closed_at = ? WHERE program_id = ? AND closed_at IS NULL`,
      [closedAt, programId],
    );
  }

  async resolveExpiryForProgram(
    program: ProgramRecord,
    practitionerId: string,
    now: Date = new Date(),
  ): Promise<ShareLinkExpiryChoice> {
    if (program.link_expires_in) {
      return validateShareLinkExpiryChoice(
        {
          expiresIn: program.link_expires_in,
          customExpiresOn: program.link_expires_on,
        },
        now,
      );
    }
    const defaults = new ShareLinkDefaultsRepository(this.sql);
    const practitionerChoice = await defaults.getPractitionerDefault(practitionerId);
    if (practitionerChoice) {
      return validateShareLinkExpiryChoice(practitionerChoice, now);
    }
    const globalChoice = await defaults.getGlobalDefault();
    return validateShareLinkExpiryChoice(globalChoice, now);
  }

  async createOpenLinkForProgram(input: {
    id: string;
    programId: string;
    practitionerId: string;
    createdAt: string;
    now?: Date;
  }): Promise<ShareLinkRecord> {
    const program = await new ProgramsRepository(this.sql).findById(input.programId);
    if (!program) {
      throw new ProgramRepositoryError("Program not found");
    }
    if (program.deleted_at) {
      throw new ProgramRepositoryError("Program is deleted");
    }
    const choice = await this.resolveExpiryForProgram(
      program,
      input.practitionerId,
      input.now,
    );
    const expiresAt = resolveShareLinkExpiresAt(choice, input.now ?? new Date());
    return this.createOpenLink({
      id: input.id,
      programId: input.programId,
      createdAt: input.createdAt,
      expiresAt,
    });
  }
}

export type ShareLinkDefaultsRow = {
  scope: "global" | "practitioner";
  practitioner_id: string | null;
  expires_in: ShareLinkExpiresIn;
  custom_expires_on: string | null;
};

export class ShareLinkDefaultsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async getGlobalDefault(): Promise<ShareLinkExpiryChoice> {
    const row = await this.sql.first<ShareLinkDefaultsRow>(
      `SELECT scope, practitioner_id, expires_in, custom_expires_on
       FROM share_link_defaults WHERE scope = ? LIMIT 1`,
      ["global"],
    );
    if (!row) {
      throw new ProgramRepositoryError("Global share link default is not seeded");
    }
    return validateShareLinkExpiryChoice({
      expiresIn: row.expires_in,
      customExpiresOn: row.custom_expires_on,
    });
  }

  async getPractitionerDefault(
    practitionerId: string,
  ): Promise<ShareLinkExpiryChoice | null> {
    const row = await this.sql.first<ShareLinkDefaultsRow>(
      `SELECT scope, practitioner_id, expires_in, custom_expires_on
       FROM share_link_defaults
       WHERE scope = ? AND practitioner_id = ? LIMIT 1`,
      ["practitioner", practitionerId],
    );
    if (!row) {
      return null;
    }
    return validateShareLinkExpiryChoice({
      expiresIn: row.expires_in,
      customExpiresOn: row.custom_expires_on,
    });
  }

  async upsertPractitionerDefault(
    id: string,
    practitionerId: string,
    choice: ShareLinkExpiryChoice,
  ): Promise<void> {
    const opaqueId = validateOpaqueEntityId(id, "Share link default id");
    const validated = validateShareLinkExpiryChoice(choice);
    await this.sql.run(
      `INSERT INTO share_link_defaults (id, scope, practitioner_id, expires_in, custom_expires_on)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(practitioner_id) WHERE scope = 'practitioner' DO UPDATE SET
         expires_in = excluded.expires_in,
         custom_expires_on = excluded.custom_expires_on`,
      [
        opaqueId,
        "practitioner",
        practitionerId,
        validated.expiresIn,
        validated.customExpiresOn ?? null,
      ],
    );
  }
}
