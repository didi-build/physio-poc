import type { SqlBatchStatement, SqlStoragePort } from "../ports/sql-storage.js";
import {
  PRESCRIPTION_TYPES,
  type PrescriptionType,
} from "../../domain/exercise-types.js";
import {
  normalizeConditionLabelKey,
  validateChangeSummary,
  validateConditionLabel,
  validateOptionalRoutineName,
  validateRoutineName,
  validateRoutineWhoItsFor,
} from "../../domain/exercise-free-text.js";
import {
  parseExerciseParamsJson,
  validateExerciseParams,
  type ExerciseParams,
} from "../../domain/exercise-params.js";
import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import {
  EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE,
  PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE,
} from "../../domain/exercise-publish-media.js";
import { SqlBatchGuardError } from "../errors/sql-batch-error.js";

export class RoutineRepositoryError extends Error {
  readonly code?: string;

  constructor(message: string, options?: { code?: string; cause?: unknown }) {
    super(message, options?.cause !== undefined ? { cause: options.cause } : undefined);
    this.name = "RoutineRepositoryError";
    this.code = options?.code;
  }
}

async function runRoutineWriteBatch(
  sql: SqlStoragePort,
  statements: readonly SqlBatchStatement[],
): Promise<void> {
  try {
    await sql.batch(statements);
  } catch (error) {
    if (error instanceof SqlBatchGuardError) {
      throw new RoutineRepositoryError("Stale write", {
        code: "stale_write",
        cause: error,
      });
    }
    throw error;
  }
}

function exerciseVersionLacksPublishMediaInClause(
  exerciseVersionIds: readonly string[],
): { sql: string; bindings: string[] } | null {
  const unique = [...new Set(exerciseVersionIds)];
  if (unique.length === 0) {
    return null;
  }
  const placeholders = unique.map(() => "?").join(", ");
  return {
    sql: `NOT EXISTS (
      SELECT 1 FROM exercise_versions ev
      WHERE ev.id IN (${placeholders})
        AND ${EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE}
    )`,
    bindings: unique,
  };
}

export type ConditionRow = {
  id: string;
  label: string;
  sort_order: number;
  label_normalized: string | null;
  created_by_practitioner_id: string | null;
};

export type RoutineRecord = {
  id: string;
  created_by: string;
  created_at: string;
  condition_id: string | null;
  body_region_id: string;
  who_its_for: string | null;
  published_version: number | null;
  draft_updated_at: string;
};

export type RoutineVersionRecord = {
  id: string;
  routine_id: string;
  version_number: number;
  status: "draft" | "published";
  name: string | null;
  change_summary: string | null;
  restored_from_version_id: string | null;
  created_by: string;
  created_at: string;
};

export type RoutineVersionRow = {
  id: string;
  routine_version_id: string;
  position: number;
  exercise_id: string;
  exercise_version_id: string;
  prescription_type: PrescriptionType;
  params_json: string;
};

export type PractitionerRoutineRecord = {
  id: string;
  practitioner_id: string;
  routine_id: string;
  source_routine_version_id: string;
  source_version_number: number;
  saved_at: string;
  last_used_at: string | null;
  edited: number;
};

export type PractitionerRoutineRow = {
  id: string;
  practitioner_routine_id: string;
  position: number;
  exercise_id: string;
  exercise_version_id: string;
  prescription_type: PrescriptionType;
  params_json: string;
};

export type ProgramRoutineOrigin = "used_as_is" | "tweaked";

export async function loadPublishedRoutineVersionForRoutine(
  sql: SqlStoragePort,
  routineId: string,
  routineVersionId: string,
  fieldLabel = "routineVersionId",
): Promise<RoutineVersionRecord> {
  const normalizedRoutineId = validateOpaqueEntityId(routineId, "Routine id");
  const versionId = validateOpaqueEntityId(routineVersionId, "Routine version id");
  const versions = new RoutineVersionsRepository(sql);
  const version = await versions.findById(versionId);
  if (!version) {
    throw new RoutineRepositoryError("Source routine version not found");
  }
  if (version.routine_id !== normalizedRoutineId) {
    throw new RoutineRepositoryError(`${fieldLabel} belongs to a different routine`);
  }
  if (version.status !== "published") {
    throw new RoutineRepositoryError(
      `${fieldLabel} must be a published routine version`,
    );
  }
  return version;
}

function assertPrescriptionType(value: string): PrescriptionType {
  if ((PRESCRIPTION_TYPES as readonly string[]).includes(value)) {
    return value as PrescriptionType;
  }
  throw new RoutineRepositoryError(`Invalid prescription type: ${value}`);
}

export class ConditionsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async findById(conditionId: string): Promise<ConditionRow | null> {
    return this.sql.first<ConditionRow>(
      `SELECT id, label, sort_order, label_normalized, created_by_practitioner_id
       FROM conditions WHERE id = ? LIMIT 1`,
      [validateOpaqueEntityId(conditionId, "Condition id")],
    );
  }

  async listAll(): Promise<ConditionRow[]> {
    return this.sql.all<ConditionRow>(
      `SELECT id, label, sort_order, label_normalized, created_by_practitioner_id
       FROM conditions ORDER BY sort_order ASC, label ASC`,
    );
  }

  async findByLabelNormalizedKey(label: string): Promise<ConditionRow | null> {
    const key = normalizeConditionLabelKey(label);
    return this.sql.first<ConditionRow>(
      `SELECT id, label, sort_order, label_normalized, created_by_practitioner_id
       FROM conditions WHERE label_normalized = ? LIMIT 1`,
      [key],
    );
  }

  async searchTypeaheadByLabel(
    normalizedPrefix: string,
    limit = 20,
  ): Promise<ConditionRow[]> {
    const prefix = normalizeConditionLabelKey(normalizedPrefix);
    if (prefix.length < 1) {
      return [];
    }
    const capped = Math.min(Math.max(limit, 1), 50);
    return this.sql.all<ConditionRow>(
      `SELECT id, label, sort_order, label_normalized, created_by_practitioner_id
       FROM conditions
       WHERE label_normalized LIKE ? ESCAPE '\\'
       ORDER BY sort_order ASC, label ASC
       LIMIT ?`,
      [
        `${prefix.replace(/\\/g, "\\\\").replace(/%/g, "\\%").replace(/_/g, "\\_")}%`,
        capped,
      ],
    );
  }

  async insert(input: {
    id: string;
    label: string;
    sortOrder?: number;
    createdByPractitionerId?: string | null;
  }): Promise<void> {
    const id = validateOpaqueEntityId(input.id, "Condition id");
    const label = validateConditionLabel(input.label);
    const normalized = normalizeConditionLabelKey(label);
    const createdBy =
      input.createdByPractitionerId === undefined ||
      input.createdByPractitionerId === null
        ? null
        : validateOpaqueEntityId(input.createdByPractitionerId, "Practitioner id");
    await this.sql.run(
      `INSERT INTO conditions (
        id, label, label_normalized, sort_order, created_by_practitioner_id
      ) VALUES (?, ?, ?, ?, ?)`,
      [id, label, normalized, input.sortOrder ?? 0, createdBy],
    );
  }

  async updateLabel(input: { id: string; label: string }): Promise<void> {
    const id = validateOpaqueEntityId(input.id, "Condition id");
    const label = validateConditionLabel(input.label);
    const normalized = normalizeConditionLabelKey(label);
    await this.sql.run(
      `UPDATE conditions SET label = ?, label_normalized = ? WHERE id = ?`,
      [label, normalized, id],
    );
  }

  async deleteById(conditionId: string): Promise<void> {
    await this.sql.run(`DELETE FROM conditions WHERE id = ?`, [
      validateOpaqueEntityId(conditionId, "Condition id"),
    ]);
  }
}

export class RoutineConditionsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async listConditionIdsForRoutine(routineId: string): Promise<string[]> {
    const rid = validateOpaqueEntityId(routineId, "Routine id");
    const rows = await this.sql.all<{ condition_id: string }>(
      `SELECT condition_id FROM routine_conditions WHERE routine_id = ?
       ORDER BY condition_id ASC`,
      [rid],
    );
    return rows.map((row) => row.condition_id);
  }

  async link(routineId: string, conditionId: string): Promise<void> {
    await this.sql.run(
      `INSERT OR IGNORE INTO routine_conditions (routine_id, condition_id) VALUES (?, ?)`,
      [
        validateOpaqueEntityId(routineId, "Routine id"),
        validateOpaqueEntityId(conditionId, "Condition id"),
      ],
    );
  }

  async unlink(routineId: string, conditionId: string): Promise<void> {
    await this.sql.run(
      `DELETE FROM routine_conditions WHERE routine_id = ? AND condition_id = ?`,
      [
        validateOpaqueEntityId(routineId, "Routine id"),
        validateOpaqueEntityId(conditionId, "Condition id"),
      ],
    );
  }

  async replaceAllForRoutine(
    routineId: string,
    conditionIds: readonly string[],
  ): Promise<void> {
    const rid = validateOpaqueEntityId(routineId, "Routine id");
    const normalizedIds = conditionIds.map((cid) =>
      validateOpaqueEntityId(cid, "Condition id"),
    );
    const unique = [...new Set(normalizedIds)];
    await this.sql.run(`DELETE FROM routine_conditions WHERE routine_id = ?`, [rid]);
    for (const conditionId of unique) {
      await this.sql.run(
        `INSERT INTO routine_conditions (routine_id, condition_id) VALUES (?, ?)`,
        [rid, conditionId],
      );
    }
  }
}

export class RoutinesRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async findById(id: string): Promise<RoutineRecord | null> {
    return this.sql.first<RoutineRecord>(
      `SELECT id, created_by, created_at, condition_id, body_region_id, who_its_for,
              published_version, draft_updated_at
       FROM routines WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  /** Returns null when the routine is draft-only and the viewer is not the author. */
  async findVisibleToPractitioner(
    routineId: string,
    viewerPractitionerId: string,
  ): Promise<RoutineRecord | null> {
    const routine = await this.findById(routineId);
    if (!routine) {
      return null;
    }
    if (routine.published_version !== null) {
      return routine;
    }
    if (routine.created_by === viewerPractitionerId) {
      return routine;
    }
    return null;
  }

  async listDraftsForAuthor(practitionerId: string): Promise<RoutineRecord[]> {
    return this.sql.all<RoutineRecord>(
      `SELECT id, created_by, created_at, condition_id, body_region_id, who_its_for,
              published_version, draft_updated_at
       FROM routines
       WHERE created_by = ? AND published_version IS NULL
       ORDER BY draft_updated_at DESC`,
      [practitionerId],
    );
  }

  async listPublishedCommunity(): Promise<RoutineRecord[]> {
    return this.sql.all<RoutineRecord>(
      `SELECT id, created_by, created_at, condition_id, body_region_id, who_its_for,
              published_version, draft_updated_at
       FROM routines
       WHERE published_version IS NOT NULL
       ORDER BY draft_updated_at DESC`,
    );
  }

  async createDraft(input: {
    id: string;
    draftVersionId: string;
    createdBy: string;
    createdAt: string;
    bodyRegionId: string;
    conditionId?: string | null;
    whoItsFor?: string | null;
    name?: string | null;
  }): Promise<RoutineRecord> {
    const routineId = validateOpaqueEntityId(input.id, "Routine id");
    const draftVersionId = validateOpaqueEntityId(
      input.draftVersionId,
      "Routine version id",
    );
    const bodyRegionId = input.bodyRegionId.trim();
    if (bodyRegionId.length < 1) {
      throw new RoutineRepositoryError("Body region id must not be empty");
    }
    const conditionId = input.conditionId
      ? validateOpaqueEntityId(input.conditionId, "Condition id")
      : null;
    const whoItsFor = validateRoutineWhoItsFor(input.whoItsFor ?? null);
    const name = validateOptionalRoutineName(input.name ?? null);

    await runRoutineWriteBatch(
      this.sql,
      this.buildCreateDraftBatchStatements({
        routineId,
        draftVersionId,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        conditionId,
        bodyRegionId,
        whoItsFor,
        name,
      }),
    );
    const created = await this.findById(routineId);
    if (!created) {
      throw new RoutineRepositoryError("Routine insert failed");
    }
    return created;
  }

  buildCreateDraftBatchStatements(input: {
    routineId: string;
    draftVersionId: string;
    createdBy: string;
    createdAt: string;
    conditionId: string | null;
    bodyRegionId: string;
    whoItsFor: string | null;
    name: string | null;
  }): SqlBatchStatement[] {
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const draftVersionId = validateOpaqueEntityId(
      input.draftVersionId,
      "Routine version id",
    );
    return [
      {
        sql: `INSERT INTO routines (
        id, created_by, created_at, condition_id, body_region_id, who_its_for,
        published_version, draft_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bindings: [
          routineId,
          input.createdBy,
          input.createdAt,
          input.conditionId,
          input.bodyRegionId,
          input.whoItsFor,
          null,
          input.createdAt,
        ],
        minRowsAffected: 1,
      },
      {
        sql: `INSERT INTO routine_versions (
        id, routine_id, version_number, status, name, change_summary,
        restored_from_version_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bindings: [
          draftVersionId,
          routineId,
          0,
          "draft",
          input.name,
          null,
          null,
          input.createdBy,
          input.createdAt,
        ],
        minRowsAffected: 1,
      },
    ];
  }

  async updateDraftMetadata(input: {
    routineId: string;
    authorId: string;
    draftUpdatedAt: string;
    conditionId?: string | null;
    bodyRegionId?: string;
    whoItsFor?: string | null;
    name?: string | null;
  }): Promise<void> {
    const routine = await this.findById(input.routineId);
    if (!routine) {
      throw new RoutineRepositoryError("Routine not found");
    }
    if (routine.created_by !== input.authorId) {
      throw new RoutineRepositoryError("Only the author can edit this draft");
    }
    if (routine.published_version !== null) {
      throw new RoutineRepositoryError(
        "Published routines use version saves, not draft metadata",
      );
    }
    const conditionId =
      input.conditionId === undefined
        ? routine.condition_id
        : input.conditionId
          ? validateOpaqueEntityId(input.conditionId, "Condition id")
          : null;
    const bodyRegionId = input.bodyRegionId
      ? input.bodyRegionId.trim()
      : routine.body_region_id;
    if (bodyRegionId.length < 1) {
      throw new RoutineRepositoryError("Body region id must not be empty");
    }
    const whoItsFor =
      input.whoItsFor === undefined
        ? routine.who_its_for
        : validateRoutineWhoItsFor(input.whoItsFor);
    const name =
      input.name === undefined ? undefined : validateOptionalRoutineName(input.name);

    await this.sql.run(
      `UPDATE routines SET
        condition_id = ?, body_region_id = ?, who_its_for = ?, draft_updated_at = ?
       WHERE id = ?`,
      [conditionId, bodyRegionId, whoItsFor, input.draftUpdatedAt, input.routineId],
    );
    if (name !== undefined) {
      await this.sql.run(
        `UPDATE routine_versions SET name = ?
         WHERE routine_id = ? AND status = 'draft'`,
        [name, input.routineId],
      );
    }
  }

  buildDeleteDraftBatchStatements(
    routineId: string,
    authorId: string,
  ): SqlBatchStatement[] {
    const rid = validateOpaqueEntityId(routineId, "Routine id");
    const author = validateOpaqueEntityId(authorId, "Author id");
    return [
      {
        sql: `DELETE FROM routine_version_rows WHERE routine_version_id IN (
          SELECT id FROM routine_versions WHERE routine_id = ?
        )`,
        bindings: [rid],
      },
      {
        sql: `DELETE FROM routine_versions WHERE routine_id = ?`,
        bindings: [rid],
      },
      {
        sql: `DELETE FROM routines WHERE id = ? AND created_by = ? AND published_version IS NULL`,
        bindings: [rid, author],
        minRowsAffected: 1,
      },
    ];
  }

  async deleteDraft(routineId: string, authorId: string): Promise<void> {
    const routine = await this.findById(routineId);
    if (!routine) {
      throw new RoutineRepositoryError("Routine not found");
    }
    if (routine.created_by !== authorId) {
      throw new RoutineRepositoryError("Only the author can delete this draft");
    }
    if (routine.published_version !== null) {
      throw new RoutineRepositoryError("Cannot delete a published routine");
    }
    await runRoutineWriteBatch(
      this.sql,
      this.buildDeleteDraftBatchStatements(routineId, authorId),
    );
  }

  async recreateDraftFromSnapshot(input: {
    id: string;
    draftVersionId: string;
    createdBy: string;
    createdAt: string;
    draftUpdatedAt: string;
    bodyRegionId: string;
    conditionId?: string | null;
    whoItsFor?: string | null;
    name?: string | null;
    rows: {
      id: string;
      position: number;
      exerciseId: string;
      exerciseVersionId: string;
      prescriptionType: PrescriptionType;
      params: ExerciseParams;
    }[];
  }): Promise<void> {
    const rowRepo = new RoutineVersionRowsRepository(this.sql);
    const rowStatements = input.rows.map((row) =>
      rowRepo.buildInsertRowBatchStatement({
        id: row.id,
        routineVersionId: input.draftVersionId,
        position: row.position,
        exerciseId: row.exerciseId,
        exerciseVersionId: row.exerciseVersionId,
        prescriptionType: row.prescriptionType,
        params: row.params,
      }),
    );
    await runRoutineWriteBatch(this.sql, [
      ...this.buildCreateDraftBatchStatements({
        routineId: input.id,
        draftVersionId: input.draftVersionId,
        createdBy: input.createdBy,
        createdAt: input.createdAt,
        conditionId: input.conditionId ?? null,
        bodyRegionId: input.bodyRegionId,
        whoItsFor: input.whoItsFor ?? null,
        name: input.name ?? null,
      }),
      {
        sql: `UPDATE routines SET draft_updated_at = ? WHERE id = ?`,
        bindings: [
          input.draftUpdatedAt,
          validateOpaqueEntityId(input.id, "Routine id"),
        ],
        minRowsAffected: 1,
      },
      ...rowStatements,
    ]);
  }

  async recordDraftDiscard(input: {
    routineId: string;
    practitionerId: string;
    draftVersionId: string;
    discardedAt: string;
  }): Promise<void> {
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const practitionerId = validateOpaqueEntityId(
      input.practitionerId,
      "Practitioner id",
    );
    const draftVersionId = validateOpaqueEntityId(
      input.draftVersionId,
      "Draft version id",
    );
    await this.sql.run(
      `INSERT INTO routine_draft_discards (routine_id, practitioner_id, draft_version_id, discarded_at)
       VALUES (?, ?, ?, ?)`,
      [routineId, practitionerId, draftVersionId, input.discardedAt],
    );
  }

  async hasDraftDiscardForUndo(input: {
    routineId: string;
    practitionerId: string;
    draftVersionId: string;
  }): Promise<boolean> {
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const practitionerId = validateOpaqueEntityId(
      input.practitionerId,
      "Practitioner id",
    );
    const draftVersionId = validateOpaqueEntityId(
      input.draftVersionId,
      "Draft version id",
    );
    const row = await this.sql.first<{ routine_id: string }>(
      `SELECT routine_id FROM routine_draft_discards
       WHERE routine_id = ? AND practitioner_id = ? AND draft_version_id = ?
       LIMIT 1`,
      [routineId, practitionerId, draftVersionId],
    );
    return row !== null;
  }

  async removeDraftDiscard(input: {
    routineId: string;
    practitionerId: string;
    draftVersionId: string;
  }): Promise<void> {
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const practitionerId = validateOpaqueEntityId(
      input.practitionerId,
      "Practitioner id",
    );
    const draftVersionId = validateOpaqueEntityId(
      input.draftVersionId,
      "Draft version id",
    );
    await this.sql.run(
      `DELETE FROM routine_draft_discards
       WHERE routine_id = ? AND practitioner_id = ? AND draft_version_id = ?`,
      [routineId, practitionerId, draftVersionId],
    );
  }
}

export class RoutineVersionsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async findById(id: string): Promise<RoutineVersionRecord | null> {
    return this.sql.first<RoutineVersionRecord>(
      `SELECT id, routine_id, version_number, status, name, change_summary,
              restored_from_version_id, created_by, created_at
       FROM routine_versions WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  async findDraftForRoutine(routineId: string): Promise<RoutineVersionRecord | null> {
    return this.sql.first<RoutineVersionRecord>(
      `SELECT id, routine_id, version_number, status, name, change_summary,
              restored_from_version_id, created_by, created_at
       FROM routine_versions
       WHERE routine_id = ? AND status = 'draft'
       LIMIT 1`,
      [routineId],
    );
  }

  async findPublishedVersion(
    routineId: string,
    versionNumber: number,
  ): Promise<RoutineVersionRecord | null> {
    return this.sql.first<RoutineVersionRecord>(
      `SELECT id, routine_id, version_number, status, name, change_summary,
              restored_from_version_id, created_by, created_at
       FROM routine_versions
       WHERE routine_id = ? AND status = 'published' AND version_number = ?
       LIMIT 1`,
      [routineId, versionNumber],
    );
  }

  /** Published versions with version_number strictly greater than baseline, ascending. */
  async listPublishedVersionsAfterBaseline(
    routineId: string,
    baselineVersionNumber: number,
  ): Promise<RoutineVersionRecord[]> {
    return this.sql.all<RoutineVersionRecord>(
      `SELECT id, routine_id, version_number, status, name, change_summary,
              restored_from_version_id, created_by, created_at
       FROM routine_versions
       WHERE routine_id = ? AND status = 'published' AND version_number > ?
       ORDER BY version_number ASC`,
      [routineId, baselineVersionNumber],
    );
  }

  async listPublishedVersionsForRoutine(
    routineId: string,
  ): Promise<RoutineVersionRecord[]> {
    return this.sql.all<RoutineVersionRecord>(
      `SELECT id, routine_id, version_number, status, name, change_summary,
              restored_from_version_id, created_by, created_at
       FROM routine_versions
       WHERE routine_id = ? AND status = 'published'
       ORDER BY version_number DESC`,
      [validateOpaqueEntityId(routineId, "Routine id")],
    );
  }

  async exerciseVersionsLackPublishMedia(
    exerciseVersionIds: readonly string[],
  ): Promise<boolean> {
    const clause = exerciseVersionLacksPublishMediaInClause(exerciseVersionIds);
    if (!clause) {
      return false;
    }
    const row = await this.sql.first<{ c: number }>(
      `SELECT COUNT(*) AS c FROM exercise_versions ev
       WHERE ev.id IN (${clause.bindings.map(() => "?").join(", ")})
         AND ${EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE}`,
      clause.bindings,
    );
    return (row?.c ?? 0) > 0;
  }

  private async throwRoutinePublishGuardFailure(
    input: {
      routineId: string;
      draftVersionId: string;
      authorId: string;
      exerciseVersionIds: readonly string[];
      expectedPublishedVersion: number | null;
    },
    guardError?: SqlBatchGuardError,
  ): Promise<never> {
    if (await this.exerciseVersionsLackPublishMedia(input.exerciseVersionIds)) {
      throw new RoutineRepositoryError(PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE, {
        code: "missing_images_block_publish",
      });
    }
    const routine = await new RoutinesRepository(this.sql).findById(input.routineId);
    const stale = (message = "Stale write") =>
      new RoutineRepositoryError(message, {
        code: "stale_write",
        ...(guardError ? { cause: guardError } : {}),
      });
    if (input.expectedPublishedVersion === null) {
      if (!routine || routine.published_version !== null) {
        throw stale();
      }
      const draft = await this.sql.first<{ status: string }>(
        `SELECT status FROM routine_versions WHERE id = ? LIMIT 1`,
        [input.draftVersionId],
      );
      if (draft?.status !== "draft") {
        throw stale();
      }
      throw stale();
    }
    if (!routine || routine.published_version !== input.expectedPublishedVersion) {
      throw stale();
    }
    throw stale("Save published version failed");
  }

  async publishDraft(input: {
    routineId: string;
    authorId: string;
    publishedAt: string;
    name: string;
  }): Promise<RoutineVersionRecord> {
    const routine = await new RoutinesRepository(this.sql).findById(input.routineId);
    if (!routine) {
      throw new RoutineRepositoryError("Routine not found");
    }
    if (routine.created_by !== input.authorId) {
      throw new RoutineRepositoryError("Only the author can publish this draft");
    }
    if (routine.published_version !== null) {
      throw new RoutineRepositoryError("Routine is already published");
    }
    const draft = await this.findDraftForRoutine(input.routineId);
    if (!draft) {
      throw new RoutineRepositoryError("Draft version not found");
    }
    const name = validateRoutineName(input.name);
    const rows = await new RoutineVersionRowsRepository(this.sql).listForVersion(
      draft.id,
    );
    if (rows.length === 0) {
      throw new RoutineRepositoryError("Add at least one exercise before publish");
    }
    if (
      await this.exerciseVersionsLackPublishMedia(
        rows.map((row) => row.exercise_version_id),
      )
    ) {
      throw new RoutineRepositoryError(PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE, {
        code: "missing_images_block_publish",
      });
    }

    const statements = this.buildPublishDraftBatchStatements({
      draftVersionId: draft.id,
      name,
      routineId: input.routineId,
      publishedAt: input.publishedAt,
      authorId: input.authorId,
    });
    try {
      await this.sql.batch(statements);
    } catch (error) {
      if (error instanceof SqlBatchGuardError) {
        await this.throwRoutinePublishGuardFailure(
          {
            routineId: input.routineId,
            draftVersionId: draft.id,
            authorId: input.authorId,
            exerciseVersionIds: rows.map((row) => row.exercise_version_id),
            expectedPublishedVersion: null,
          },
          error,
        );
      }
      throw error;
    }
    const published = await this.findPublishedVersion(input.routineId, 1);
    if (!published) {
      throw new RoutineRepositoryError("Publish failed");
    }
    return published;
  }

  buildPublishDraftBatchStatements(input: {
    draftVersionId: string;
    name: string;
    routineId: string;
    publishedAt: string;
    authorId: string;
  }): SqlBatchStatement[] {
    const draftVersionId = validateOpaqueEntityId(
      input.draftVersionId,
      "Routine version id",
    );
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const authorId = validateOpaqueEntityId(input.authorId, "Author id");
    const name = validateRoutineName(input.name);
    return [
      {
        sql: `UPDATE routine_versions SET status = ?, version_number = ?, name = ?
       WHERE id = ? AND status = ?
         AND NOT EXISTS (
           SELECT 1 FROM routine_version_rows rvr
           INNER JOIN exercise_versions ev ON ev.id = rvr.exercise_version_id
           WHERE rvr.routine_version_id = ?
             AND ${EXERCISE_VERSION_LACKS_PUBLISH_MEDIA_WHERE}
         )`,
        bindings: ["published", 1, name, draftVersionId, "draft", draftVersionId],
        minRowsAffected: 1,
      },
      {
        sql: `UPDATE routines SET published_version = ?, draft_updated_at = ?
       WHERE id = ? AND published_version IS NULL AND created_by = ?`,
        bindings: [1, input.publishedAt, routineId, authorId],
        minRowsAffected: 1,
      },
    ];
  }

  async savePublishedVersion(input: {
    id: string;
    routineId: string;
    createdBy: string;
    createdAt: string;
    name: string;
    changeSummary?: string | null;
    restoredFromVersionId?: string | null;
    copyFromVersionId: string;
    rows?: {
      id: string;
      position: number;
      exerciseId: string;
      exerciseVersionId: string;
      prescriptionType: PrescriptionType;
      params: ExerciseParams;
    }[];
    conditionId?: string | null;
    bodyRegionId?: string;
    whoItsFor?: string | null;
  }): Promise<RoutineVersionRecord> {
    const versionId = validateOpaqueEntityId(input.id, "Routine version id");
    const routine = await new RoutinesRepository(this.sql).findById(input.routineId);
    if (!routine || routine.published_version === null) {
      throw new RoutineRepositoryError("Routine is not published");
    }
    const nextVersion = routine.published_version + 1;
    const name = validateRoutineName(input.name);
    const changeSummary = validateChangeSummary(input.changeSummary);
    const restoredFrom = input.restoredFromVersionId
      ? validateOpaqueEntityId(input.restoredFromVersionId, "Restored from version id")
      : null;
    if (restoredFrom) {
      await loadPublishedRoutineVersionForRoutine(
        this.sql,
        input.routineId,
        restoredFrom,
        "restoredFromVersionId",
      );
    }
    await loadPublishedRoutineVersionForRoutine(
      this.sql,
      input.routineId,
      input.copyFromVersionId,
      "copyFromVersionId",
    );
    const rowRepo = new RoutineVersionRowsRepository(this.sql);
    let rowStatements: SqlBatchStatement[];
    if (input.rows) {
      if (input.rows.length === 0) {
        throw new RoutineRepositoryError("Cannot save an empty routine version");
      }
      rowStatements = input.rows.map((row) =>
        rowRepo.buildInsertRowBatchStatement({
          id: row.id,
          routineVersionId: versionId,
          position: row.position,
          exerciseId: row.exerciseId,
          exerciseVersionId: row.exerciseVersionId,
          prescriptionType: row.prescriptionType,
          params: row.params,
        }),
      );
    } else {
      const sourceRows = await rowRepo.listForVersion(input.copyFromVersionId);
      if (sourceRows.length === 0) {
        throw new RoutineRepositoryError("Cannot save an empty routine version");
      }
      rowStatements = sourceRows.map((row) =>
        rowRepo.buildInsertRowBatchStatement({
          id: crypto.randomUUID(),
          routineVersionId: versionId,
          position: row.position,
          exerciseId: row.exercise_id,
          exerciseVersionId: row.exercise_version_id,
          prescriptionType: row.prescription_type,
          params: parseExerciseParamsJson(row.params_json),
        }),
      );
    }
    const exerciseVersionIds = input.rows
      ? input.rows.map((row) => row.exerciseVersionId)
      : (await rowRepo.listForVersion(input.copyFromVersionId)).map(
          (row) => row.exercise_version_id,
        );
    if (await this.exerciseVersionsLackPublishMedia(exerciseVersionIds)) {
      throw new RoutineRepositoryError(PUBLISH_BLOCKED_BY_MISSING_IMAGES_MESSAGE, {
        code: "missing_images_block_publish",
      });
    }
    const statements = this.buildSavePublishedVersionBatchStatements({
      versionId,
      routineId: input.routineId,
      nextVersion,
      expectedPublishedVersion: routine.published_version,
      name,
      changeSummary,
      restoredFrom,
      createdBy: input.createdBy,
      createdAt: input.createdAt,
      rowStatements,
      exerciseVersionIds,
      conditionId:
        input.conditionId === undefined ? routine.condition_id : input.conditionId,
      bodyRegionId: input.bodyRegionId ?? routine.body_region_id,
      whoItsFor: input.whoItsFor === undefined ? routine.who_its_for : input.whoItsFor,
    });
    try {
      await this.sql.batch(statements);
    } catch (error) {
      if (error instanceof SqlBatchGuardError) {
        await this.throwRoutinePublishGuardFailure(
          {
            routineId: input.routineId,
            draftVersionId: versionId,
            authorId: input.createdBy,
            exerciseVersionIds,
            expectedPublishedVersion: routine.published_version,
          },
          error,
        );
      }
      throw error;
    }
    const saved = await this.findPublishedVersion(input.routineId, nextVersion);
    if (!saved) {
      throw new RoutineRepositoryError("Save published version failed");
    }
    return saved;
  }

  buildSavePublishedVersionBatchStatements(input: {
    versionId: string;
    routineId: string;
    nextVersion: number;
    expectedPublishedVersion: number;
    name: string;
    changeSummary: string | null;
    restoredFrom: string | null;
    createdBy: string;
    createdAt: string;
    rowStatements: SqlBatchStatement[];
    exerciseVersionIds: readonly string[];
    conditionId: string | null;
    bodyRegionId: string;
    whoItsFor: string | null;
  }): SqlBatchStatement[] {
    const versionId = validateOpaqueEntityId(input.versionId, "Routine version id");
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const mediaGuard = exerciseVersionLacksPublishMediaInClause(
      input.exerciseVersionIds,
    );
    const mediaGuardSql = mediaGuard ? ` AND ${mediaGuard.sql}` : "";
    const mediaGuardBindings = mediaGuard?.bindings ?? [];
    return [
      {
        sql: `UPDATE routines SET published_version = ?, draft_updated_at = ?,
            condition_id = ?, body_region_id = ?, who_its_for = ?
            WHERE id = ? AND published_version = ?${mediaGuardSql}`,
        bindings: [
          input.nextVersion,
          input.createdAt,
          input.conditionId,
          input.bodyRegionId,
          input.whoItsFor,
          routineId,
          input.expectedPublishedVersion,
          ...mediaGuardBindings,
        ],
        minRowsAffected: 1,
      },
      {
        sql: `INSERT INTO routine_versions (
        id, routine_id, version_number, status, name, change_summary,
        restored_from_version_id, created_by, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        bindings: [
          versionId,
          routineId,
          input.nextVersion,
          "published",
          input.name,
          input.changeSummary,
          input.restoredFrom,
          input.createdBy,
          input.createdAt,
        ],
      },
      ...input.rowStatements,
    ];
  }
}

export class RoutineVersionRowsRepository {
  constructor(protected readonly sql: SqlStoragePort) {}

  async listForVersion(routineVersionId: string): Promise<RoutineVersionRow[]> {
    const rows = await this.sql.all<RoutineVersionRow>(
      `SELECT id, routine_version_id, position, exercise_id, exercise_version_id,
              prescription_type, params_json
       FROM routine_version_rows
       WHERE routine_version_id = ?
       ORDER BY position ASC`,
      [routineVersionId],
    );
    return rows.map((row) => ({
      ...row,
      prescription_type: assertPrescriptionType(row.prescription_type),
    }));
  }

  buildInsertRowBatchStatement(input: {
    id: string;
    routineVersionId: string;
    position: number;
    exerciseId: string;
    exerciseVersionId: string;
    prescriptionType: PrescriptionType;
    params: ExerciseParams;
  }): SqlBatchStatement {
    const rowId = validateOpaqueEntityId(input.id, "Routine version row id");
    const routineVersionId = validateOpaqueEntityId(
      input.routineVersionId,
      "Routine version id",
    );
    const exerciseId = validateOpaqueEntityId(input.exerciseId, "Exercise id");
    const exerciseVersionId = validateOpaqueEntityId(
      input.exerciseVersionId,
      "Exercise version id",
    );
    const paramsJson = JSON.stringify(validateExerciseParams(input.params));
    return {
      sql: `INSERT INTO routine_version_rows (
        id, routine_version_id, position, exercise_id, exercise_version_id,
        prescription_type, params_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      bindings: [
        rowId,
        routineVersionId,
        input.position,
        exerciseId,
        exerciseVersionId,
        input.prescriptionType,
        paramsJson,
      ],
    };
  }

  async insertRow(input: {
    id: string;
    routineVersionId: string;
    position: number;
    exerciseId: string;
    exerciseVersionId: string;
    prescriptionType: PrescriptionType;
    params: ExerciseParams;
  }): Promise<void> {
    const statement = this.buildInsertRowBatchStatement(input);
    await this.sql.run(statement.sql, statement.bindings);
  }

  async replaceDraftRow(input: {
    id: string;
    routineId: string;
    authorId: string;
    position: number;
    exerciseId: string;
    exerciseVersionId: string;
    prescriptionType: PrescriptionType;
    params: ExerciseParams;
    draftUpdatedAt: string;
  }): Promise<void> {
    const rowId = validateOpaqueEntityId(input.id, "Routine version row id");
    const routine = await new RoutinesRepository(this.sql).findById(input.routineId);
    if (!routine) {
      throw new RoutineRepositoryError("Routine not found");
    }
    if (routine.created_by !== input.authorId) {
      throw new RoutineRepositoryError("Only the author can edit draft rows");
    }
    if (routine.published_version !== null) {
      throw new RoutineRepositoryError("Use published version saves for live routines");
    }
    const draft = await new RoutineVersionsRepository(this.sql).findDraftForRoutine(
      input.routineId,
    );
    if (!draft) {
      throw new RoutineRepositoryError("Draft version not found");
    }
    const exerciseId = validateOpaqueEntityId(input.exerciseId, "Exercise id");
    const exerciseVersionId = validateOpaqueEntityId(
      input.exerciseVersionId,
      "Exercise version id",
    );
    const paramsJson = JSON.stringify(validateExerciseParams(input.params));

    await this.sql.run(
      `INSERT INTO routine_version_rows (
        id, routine_version_id, position, exercise_id, exercise_version_id,
        prescription_type, params_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(routine_version_id, position) DO UPDATE SET
        exercise_id = excluded.exercise_id,
        exercise_version_id = excluded.exercise_version_id,
        prescription_type = excluded.prescription_type,
        params_json = excluded.params_json`,
      [
        rowId,
        draft.id,
        input.position,
        exerciseId,
        exerciseVersionId,
        input.prescriptionType,
        paramsJson,
      ],
    );
    await this.sql.run(`UPDATE routines SET draft_updated_at = ? WHERE id = ?`, [
      input.draftUpdatedAt,
      input.routineId,
    ]);
  }

  async replaceAllDraftRows(input: {
    routineId: string;
    authorId: string;
    draftUpdatedAt: string;
    rows: {
      id: string;
      position: number;
      exerciseId: string;
      exerciseVersionId: string;
      prescriptionType: PrescriptionType;
      params: ExerciseParams;
    }[];
  }): Promise<void> {
    const routine = await new RoutinesRepository(this.sql).findById(input.routineId);
    if (!routine) {
      throw new RoutineRepositoryError("Routine not found");
    }
    if (routine.created_by !== input.authorId) {
      throw new RoutineRepositoryError("Only the author can edit draft rows");
    }
    if (routine.published_version !== null) {
      throw new RoutineRepositoryError("Use published version saves for live routines");
    }
    const draft = await new RoutineVersionsRepository(this.sql).findDraftForRoutine(
      input.routineId,
    );
    if (!draft) {
      throw new RoutineRepositoryError("Draft version not found");
    }
    const rowStatements = input.rows.map((row) =>
      this.buildInsertRowBatchStatement({
        id: row.id,
        routineVersionId: draft.id,
        position: row.position,
        exerciseId: row.exerciseId,
        exerciseVersionId: row.exerciseVersionId,
        prescriptionType: row.prescriptionType,
        params: row.params,
      }),
    );
    await runRoutineWriteBatch(this.sql, [
      {
        sql: `DELETE FROM routine_version_rows WHERE routine_version_id = ?`,
        bindings: [draft.id],
      },
      ...rowStatements,
      {
        sql: `UPDATE routines SET draft_updated_at = ? WHERE id = ?`,
        bindings: [input.draftUpdatedAt, input.routineId],
        minRowsAffected: 1,
      },
    ]);
  }
}

export class PractitionerRoutinesRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async findForPractitioner(
    practitionerId: string,
    routineId: string,
  ): Promise<PractitionerRoutineRecord | null> {
    return this.sql.first<PractitionerRoutineRecord>(
      `SELECT id, practitioner_id, routine_id, source_routine_version_id,
              source_version_number, saved_at, last_used_at, edited
       FROM practitioner_routines
       WHERE practitioner_id = ? AND routine_id = ?
       LIMIT 1`,
      [practitionerId, routineId],
    );
  }

  async saveFrozenCopy(input: {
    id: string;
    practitionerId: string;
    routineId: string;
    sourceRoutineVersionId: string;
    savedAt: string;
    rows: {
      id: string;
      position: number;
      exerciseId: string;
      exerciseVersionId: string;
      prescriptionType: PrescriptionType;
      params: ExerciseParams;
    }[];
  }): Promise<PractitionerRoutineRecord> {
    const copyId = validateOpaqueEntityId(input.id, "Practitioner routine id");
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const sourceVersion = await loadPublishedRoutineVersionForRoutine(
      this.sql,
      routineId,
      input.sourceRoutineVersionId,
      "sourceRoutineVersionId",
    );
    const routine = await new RoutinesRepository(this.sql).findById(routineId);
    if (!routine || routine.published_version === null) {
      throw new RoutineRepositoryError("Routine is not published");
    }
    if (input.rows.length === 0) {
      throw new RoutineRepositoryError("Cannot save an empty routine copy");
    }

    const rowRepo = new PractitionerRoutineRowsRepository(this.sql);
    const rowStatements = input.rows.map((row) =>
      rowRepo.buildInsertRowBatchStatement({
        id: row.id,
        practitionerRoutineId: copyId,
        position: row.position,
        exerciseId: row.exerciseId,
        exerciseVersionId: row.exerciseVersionId,
        prescriptionType: row.prescriptionType,
        params: row.params,
      }),
    );
    await runRoutineWriteBatch(
      this.sql,
      this.buildSaveFrozenCopyBatchStatements({
        copyId,
        practitionerId: input.practitionerId,
        routineId,
        sourceRoutineVersionId: sourceVersion.id,
        sourceVersionNumber: sourceVersion.version_number,
        routineCreatedBy: routine.created_by,
        savedAt: input.savedAt,
        rowStatements,
      }),
    );
    const saved = await this.findForPractitioner(input.practitionerId, routineId);
    if (!saved) {
      throw new RoutineRepositoryError("Save frozen copy failed");
    }
    return saved;
  }

  buildSaveFrozenCopyBatchStatements(input: {
    copyId: string;
    practitionerId: string;
    routineId: string;
    sourceRoutineVersionId: string;
    sourceVersionNumber: number;
    routineCreatedBy: string;
    savedAt: string;
    rowStatements: SqlBatchStatement[];
  }): SqlBatchStatement[] {
    const copyId = validateOpaqueEntityId(input.copyId, "Practitioner routine id");
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const sourceRoutineVersionId = validateOpaqueEntityId(
      input.sourceRoutineVersionId,
      "Source routine version id",
    );
    const routineCreatedBy = validateOpaqueEntityId(
      input.routineCreatedBy,
      "Routine author id",
    );
    return [
      {
        sql: `INSERT INTO practitioner_routines (
        id, practitioner_id, routine_id, source_routine_version_id,
        source_version_number, saved_at, last_used_at, edited
      )
      SELECT ?, ?, r.id, ?, ?, ?, ?, ?
      FROM routines r
      WHERE r.id = ? AND r.published_version = ? AND r.created_by = ?`,
        bindings: [
          copyId,
          input.practitionerId,
          sourceRoutineVersionId,
          input.sourceVersionNumber,
          input.savedAt,
          null,
          0,
          routineId,
          input.sourceVersionNumber,
          routineCreatedBy,
        ],
        minRowsAffected: 1,
      },
      ...input.rowStatements,
    ];
  }

  hasCommunityUpdateFlag(
    copy: PractitionerRoutineRecord,
    routine: RoutineRecord,
  ): boolean {
    if (routine.published_version === null) {
      return false;
    }
    return routine.published_version > copy.source_version_number;
  }

  async listSavedForPractitioner(
    practitionerId: string,
  ): Promise<PractitionerRoutineRecord[]> {
    return this.sql.all<PractitionerRoutineRecord>(
      `SELECT id, practitioner_id, routine_id, source_routine_version_id,
              source_version_number, saved_at, last_used_at, edited
       FROM practitioner_routines
       WHERE practitioner_id = ?
       ORDER BY saved_at DESC`,
      [practitionerId],
    );
  }

  buildDeleteCopyBatchStatements(
    copyId: string,
    practitionerId: string,
  ): SqlBatchStatement[] {
    const copyIdValidated = validateOpaqueEntityId(copyId, "Practitioner routine id");
    return [
      {
        sql: `DELETE FROM practitioner_routine_rows WHERE practitioner_routine_id = ?`,
        bindings: [copyIdValidated],
      },
      {
        sql: `DELETE FROM practitioner_routines WHERE id = ? AND practitioner_id = ?`,
        bindings: [copyIdValidated, practitionerId],
        minRowsAffected: 1,
      },
    ];
  }

  async deleteCopy(practitionerId: string, routineId: string): Promise<boolean> {
    const copy = await this.findForPractitioner(practitionerId, routineId);
    if (!copy) {
      return false;
    }
    await runRoutineWriteBatch(
      this.sql,
      this.buildDeleteCopyBatchStatements(copy.id, practitionerId),
    );
    return true;
  }

  buildReplaceMyCopyRowsBatchStatements(input: {
    practitionerRoutineId: string;
    practitionerId: string;
    rowStatements: SqlBatchStatement[];
  }): SqlBatchStatement[] {
    const copyId = validateOpaqueEntityId(
      input.practitionerRoutineId,
      "Practitioner routine id",
    );
    return [
      {
        sql: `DELETE FROM practitioner_routine_rows WHERE practitioner_routine_id = ?`,
        bindings: [copyId],
      },
      {
        sql: `UPDATE practitioner_routines SET edited = 1 WHERE id = ? AND practitioner_id = ?`,
        bindings: [copyId, input.practitionerId],
        minRowsAffected: 1,
      },
      ...input.rowStatements,
    ];
  }

  async replaceMyCopyRows(input: {
    practitionerId: string;
    routineId: string;
    rows: {
      id: string;
      position: number;
      exerciseId: string;
      exerciseVersionId: string;
      prescriptionType: PrescriptionType;
      params: ExerciseParams;
    }[];
  }): Promise<PractitionerRoutineRecord> {
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const copy = await this.findForPractitioner(input.practitionerId, routineId);
    if (!copy) {
      throw new RoutineRepositoryError("Saved routine copy not found");
    }
    if (input.rows.length === 0) {
      throw new RoutineRepositoryError("Cannot save an empty routine copy");
    }
    const rowRepo = new PractitionerRoutineRowsRepository(this.sql);
    const rowStatements = input.rows.map((row) =>
      rowRepo.buildInsertRowBatchStatement({
        id: row.id,
        practitionerRoutineId: copy.id,
        position: row.position,
        exerciseId: row.exerciseId,
        exerciseVersionId: row.exerciseVersionId,
        prescriptionType: row.prescriptionType,
        params: row.params,
      }),
    );
    await runRoutineWriteBatch(
      this.sql,
      this.buildReplaceMyCopyRowsBatchStatements({
        practitionerRoutineId: copy.id,
        practitionerId: input.practitionerId,
        rowStatements,
      }),
    );
    const updated = await this.findForPractitioner(input.practitionerId, routineId);
    if (!updated) {
      throw new RoutineRepositoryError("Replace my copy rows failed");
    }
    return updated;
  }

  buildReplaceSavedCopyBatchStatements(input: {
    practitionerRoutineId: string;
    practitionerId: string;
    routineId: string;
    sourceRoutineVersionId: string;
    sourceVersionNumber: number;
    rowStatements: SqlBatchStatement[];
  }): SqlBatchStatement[] {
    const copyId = validateOpaqueEntityId(
      input.practitionerRoutineId,
      "Practitioner routine id",
    );
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const sourceRoutineVersionId = validateOpaqueEntityId(
      input.sourceRoutineVersionId,
      "Source routine version id",
    );
    return [
      {
        sql: `UPDATE routines SET draft_updated_at = draft_updated_at
              WHERE id = ? AND published_version = ?`,
        bindings: [routineId, input.sourceVersionNumber],
        minRowsAffected: 1,
      },
      {
        sql: `DELETE FROM practitioner_routine_rows WHERE practitioner_routine_id = ?`,
        bindings: [copyId],
      },
      {
        sql: `UPDATE practitioner_routines
              SET source_routine_version_id = ?,
                  source_version_number = ?,
                  edited = 0
              WHERE id = ? AND practitioner_id = ? AND routine_id = ?`,
        bindings: [
          sourceRoutineVersionId,
          input.sourceVersionNumber,
          copyId,
          input.practitionerId,
          routineId,
        ],
        minRowsAffected: 1,
      },
      ...input.rowStatements,
    ];
  }

  buildRestoreSavedCopyBatchStatements(input: {
    practitionerId: string;
    routineId: string;
    practitionerRoutineId: string;
    snapshot: {
      source_routine_version_id: string;
      source_version_number: number;
      saved_at: string;
      last_used_at: string | null;
      edited: number;
    };
    rowStatements: SqlBatchStatement[];
    hadExistingCopy: boolean;
  }): SqlBatchStatement[] {
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const copyId = validateOpaqueEntityId(
      input.practitionerRoutineId,
      "Practitioner routine id",
    );
    const sourceRoutineVersionId = validateOpaqueEntityId(
      input.snapshot.source_routine_version_id,
      "Source routine version id",
    );
    if (input.hadExistingCopy) {
      return [
        {
          sql: `DELETE FROM practitioner_routine_rows WHERE practitioner_routine_id = ?`,
          bindings: [copyId],
        },
        {
          sql: `UPDATE practitioner_routines
                SET source_routine_version_id = ?,
                    source_version_number = ?,
                    saved_at = ?,
                    last_used_at = ?,
                    edited = ?
                WHERE id = ? AND practitioner_id = ? AND routine_id = ?`,
          bindings: [
            sourceRoutineVersionId,
            input.snapshot.source_version_number,
            input.snapshot.saved_at,
            input.snapshot.last_used_at,
            input.snapshot.edited,
            copyId,
            input.practitionerId,
            routineId,
          ],
          minRowsAffected: 1,
        },
        ...input.rowStatements,
      ];
    }
    return [
      {
        sql: `INSERT INTO practitioner_routines (
          id, practitioner_id, routine_id, source_routine_version_id,
          source_version_number, saved_at, last_used_at, edited
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        bindings: [
          copyId,
          input.practitionerId,
          routineId,
          sourceRoutineVersionId,
          input.snapshot.source_version_number,
          input.snapshot.saved_at,
          input.snapshot.last_used_at,
          input.snapshot.edited,
        ],
        minRowsAffected: 1,
      },
      ...input.rowStatements,
    ];
  }

  async restoreSavedCopyFromSnapshot(input: {
    practitionerId: string;
    routineId: string;
    snapshot: {
      id: string;
      source_routine_version_id: string;
      source_version_number: number;
      saved_at: string;
      last_used_at: string | null;
      edited: number;
      rows: {
        position: number;
        exercise_id: string;
        exercise_version_id: string;
        prescription_type: PrescriptionType;
        params_json: string;
      }[];
    };
  }): Promise<PractitionerRoutineRecord> {
    if (input.snapshot.rows.length === 0) {
      throw new RoutineRepositoryError("Cannot restore an empty routine copy");
    }
    const existing = await this.findForPractitioner(
      input.practitionerId,
      input.routineId,
    );
    const copyId = existing?.id ?? input.snapshot.id;
    const rowRepo = new PractitionerRoutineRowsRepository(this.sql);
    const rowStatements = input.snapshot.rows.map((row) =>
      rowRepo.buildInsertRowBatchStatement({
        id: crypto.randomUUID(),
        practitionerRoutineId: copyId,
        position: row.position,
        exerciseId: row.exercise_id,
        exerciseVersionId: row.exercise_version_id,
        prescriptionType: row.prescription_type,
        params: parseExerciseParamsJson(row.params_json),
      }),
    );
    await runRoutineWriteBatch(
      this.sql,
      this.buildRestoreSavedCopyBatchStatements({
        practitionerId: input.practitionerId,
        routineId: input.routineId,
        practitionerRoutineId: copyId,
        snapshot: {
          source_routine_version_id: input.snapshot.source_routine_version_id,
          source_version_number: input.snapshot.source_version_number,
          saved_at: input.snapshot.saved_at,
          last_used_at: input.snapshot.last_used_at,
          edited: input.snapshot.edited,
        },
        rowStatements,
        hadExistingCopy: existing !== null,
      }),
    );
    const restored = await this.findForPractitioner(
      input.practitionerId,
      input.routineId,
    );
    if (!restored) {
      throw new RoutineRepositoryError("Restore saved copy failed");
    }
    return restored;
  }

  async replaceSavedCopyFromPublished(input: {
    practitionerId: string;
    routineId: string;
    sourceRoutineVersionId: string;
    sourceVersionNumber: number;
    rows: {
      id: string;
      position: number;
      exerciseId: string;
      exerciseVersionId: string;
      prescriptionType: PrescriptionType;
      params: ExerciseParams;
    }[];
  }): Promise<PractitionerRoutineRecord> {
    const copy = await this.findForPractitioner(input.practitionerId, input.routineId);
    if (!copy) {
      throw new RoutineRepositoryError("Saved routine copy not found");
    }
    if (input.rows.length === 0) {
      throw new RoutineRepositoryError("Cannot replace with an empty routine copy");
    }
    await loadPublishedRoutineVersionForRoutine(
      this.sql,
      input.routineId,
      input.sourceRoutineVersionId,
      "sourceRoutineVersionId",
    );
    const rowRepo = new PractitionerRoutineRowsRepository(this.sql);
    const rowStatements = input.rows.map((row) =>
      rowRepo.buildInsertRowBatchStatement({
        id: row.id,
        practitionerRoutineId: copy.id,
        position: row.position,
        exerciseId: row.exerciseId,
        exerciseVersionId: row.exerciseVersionId,
        prescriptionType: row.prescriptionType,
        params: row.params,
      }),
    );
    await runRoutineWriteBatch(
      this.sql,
      this.buildReplaceSavedCopyBatchStatements({
        practitionerRoutineId: copy.id,
        practitionerId: input.practitionerId,
        routineId: input.routineId,
        sourceRoutineVersionId: input.sourceRoutineVersionId,
        sourceVersionNumber: input.sourceVersionNumber,
        rowStatements,
      }),
    );
    const updated = await this.findForPractitioner(
      input.practitionerId,
      input.routineId,
    );
    if (!updated) {
      throw new RoutineRepositoryError("Replace saved copy failed");
    }
    return updated;
  }
}

export class PractitionerRoutineRowsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async listForCopy(practitionerRoutineId: string): Promise<PractitionerRoutineRow[]> {
    const rows = await this.sql.all<PractitionerRoutineRow>(
      `SELECT id, practitioner_routine_id, position, exercise_id, exercise_version_id,
              prescription_type, params_json
       FROM practitioner_routine_rows
       WHERE practitioner_routine_id = ?
       ORDER BY position ASC`,
      [practitionerRoutineId],
    );
    return rows.map((row) => ({
      ...row,
      prescription_type: assertPrescriptionType(row.prescription_type),
    }));
  }

  buildInsertRowBatchStatement(input: {
    id: string;
    practitionerRoutineId: string;
    position: number;
    exerciseId: string;
    exerciseVersionId: string;
    prescriptionType: PrescriptionType;
    params: ExerciseParams;
  }): SqlBatchStatement {
    const rowId = validateOpaqueEntityId(input.id, "Practitioner routine row id");
    const practitionerRoutineId = validateOpaqueEntityId(
      input.practitionerRoutineId,
      "Practitioner routine id",
    );
    const exerciseId = validateOpaqueEntityId(input.exerciseId, "Exercise id");
    const exerciseVersionId = validateOpaqueEntityId(
      input.exerciseVersionId,
      "Exercise version id",
    );
    const paramsJson = JSON.stringify(validateExerciseParams(input.params));
    return {
      sql: `INSERT INTO practitioner_routine_rows (
        id, practitioner_routine_id, position, exercise_id, exercise_version_id,
        prescription_type, params_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      bindings: [
        rowId,
        practitionerRoutineId,
        input.position,
        exerciseId,
        exerciseVersionId,
        input.prescriptionType,
        paramsJson,
      ],
    };
  }

  async insertRow(input: {
    id: string;
    practitionerRoutineId: string;
    position: number;
    exerciseId: string;
    exerciseVersionId: string;
    prescriptionType: PrescriptionType;
    params: ExerciseParams;
  }): Promise<void> {
    const statement = this.buildInsertRowBatchStatement(input);
    await this.sql.run(statement.sql, statement.bindings);
  }

  async replaceRow(input: {
    id: string;
    practitionerRoutineId: string;
    position: number;
    exerciseId: string;
    exerciseVersionId: string;
    prescriptionType: PrescriptionType;
    params: ExerciseParams;
  }): Promise<void> {
    const rowId = validateOpaqueEntityId(input.id, "Practitioner routine row id");
    const practitionerRoutineId = validateOpaqueEntityId(
      input.practitionerRoutineId,
      "Practitioner routine id",
    );
    const exerciseId = validateOpaqueEntityId(input.exerciseId, "Exercise id");
    const exerciseVersionId = validateOpaqueEntityId(
      input.exerciseVersionId,
      "Exercise version id",
    );
    const paramsJson = JSON.stringify(validateExerciseParams(input.params));

    await this.sql.run(
      `INSERT INTO practitioner_routine_rows (
        id, practitioner_routine_id, position, exercise_id, exercise_version_id,
        prescription_type, params_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(practitioner_routine_id, position) DO UPDATE SET
        exercise_id = excluded.exercise_id,
        exercise_version_id = excluded.exercise_version_id,
        prescription_type = excluded.prescription_type,
        params_json = excluded.params_json`,
      [
        rowId,
        practitionerRoutineId,
        input.position,
        exerciseId,
        exerciseVersionId,
        input.prescriptionType,
        paramsJson,
      ],
    );
    await this.sql.run(`UPDATE practitioner_routines SET edited = 1 WHERE id = ?`, [
      practitionerRoutineId,
    ]);
  }
}

export function validateProgramRoutineOriginTrio(input: {
  sourceRoutineId: string | null;
  sourceRoutineVersionId: string | null;
  sourceRoutineOrigin: ProgramRoutineOrigin | null;
}): void {
  const setCount = [
    input.sourceRoutineId,
    input.sourceRoutineVersionId,
    input.sourceRoutineOrigin,
  ].filter((value) => value !== null).length;
  if (setCount !== 0 && setCount !== 3) {
    throw new RoutineRepositoryError(
      "Program routine origin requires routine id, version id, and origin together",
    );
  }
}
