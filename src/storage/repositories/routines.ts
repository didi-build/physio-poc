import type { SqlStoragePort } from "../ports/sql-storage.js";
import {
  PRESCRIPTION_TYPES,
  type PrescriptionType,
} from "../../domain/exercise-types.js";
import {
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

export class RoutineRepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RoutineRepositoryError";
  }
}

export type ConditionRow = {
  id: string;
  label: string;
  sort_order: number;
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

function assertPrescriptionType(value: string): PrescriptionType {
  if ((PRESCRIPTION_TYPES as readonly string[]).includes(value)) {
    return value as PrescriptionType;
  }
  throw new RoutineRepositoryError(`Invalid prescription type: ${value}`);
}

export class ConditionsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async listAll(): Promise<ConditionRow[]> {
    return this.sql.all<ConditionRow>(
      "SELECT id, label, sort_order FROM conditions ORDER BY sort_order ASC, label ASC",
    );
  }

  async insert(input: {
    id: string;
    label: string;
    sortOrder?: number;
  }): Promise<void> {
    const id = validateOpaqueEntityId(input.id, "Condition id");
    const label = validateConditionLabel(input.label);
    await this.sql.run(
      "INSERT INTO conditions (id, label, sort_order) VALUES (?, ?, ?)",
      [id, label, input.sortOrder ?? 0],
    );
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

    await this.sql.run(
      `INSERT INTO routines (
        id, created_by, created_at, condition_id, body_region_id, who_its_for,
        published_version, draft_updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, ?)`,
      [
        routineId,
        input.createdBy,
        input.createdAt,
        conditionId,
        bodyRegionId,
        whoItsFor,
        input.createdAt,
      ],
    );
    await this.sql.run(
      `INSERT INTO routine_versions (
        id, routine_id, version_number, status, name, change_summary,
        restored_from_version_id, created_by, created_at
      ) VALUES (?, ?, 0, 'draft', ?, NULL, NULL, ?, ?)`,
      [draftVersionId, routineId, name, input.createdBy, input.createdAt],
    );
    const created = await this.findById(routineId);
    if (!created) {
      throw new RoutineRepositoryError("Routine insert failed");
    }
    return created;
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

    await this.sql.run(
      `UPDATE routine_versions SET status = 'published', version_number = 1, name = ?
       WHERE id = ? AND status = 'draft'`,
      [name, draft.id],
    );
    await this.sql.run(
      `UPDATE routines SET published_version = 1, draft_updated_at = ? WHERE id = ?`,
      [input.publishedAt, input.routineId],
    );
    const published = await this.findPublishedVersion(input.routineId, 1);
    if (!published) {
      throw new RoutineRepositoryError("Publish failed");
    }
    return published;
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
    const copyFromVersion = await this.findById(input.copyFromVersionId);
    if (!copyFromVersion) {
      throw new RoutineRepositoryError("Source routine version not found");
    }
    if (copyFromVersion.routine_id !== input.routineId) {
      throw new RoutineRepositoryError(
        "copyFromVersionId belongs to a different routine",
      );
    }
    const sourceRows = await new RoutineVersionRowsRepository(this.sql).listForVersion(
      input.copyFromVersionId,
    );
    if (sourceRows.length === 0) {
      throw new RoutineRepositoryError("Cannot save an empty routine version");
    }

    await this.sql.run(
      `INSERT INTO routine_versions (
        id, routine_id, version_number, status, name, change_summary,
        restored_from_version_id, created_by, created_at
      ) VALUES (?, ?, ?, 'published', ?, ?, ?, ?, ?)`,
      [
        versionId,
        input.routineId,
        nextVersion,
        name,
        changeSummary,
        restoredFrom,
        input.createdBy,
        input.createdAt,
      ],
    );
    const rowRepo = new RoutineVersionRowsRepository(this.sql);
    for (const row of sourceRows) {
      await rowRepo.insertRow({
        id: crypto.randomUUID(),
        routineVersionId: versionId,
        position: row.position,
        exerciseId: row.exercise_id,
        exerciseVersionId: row.exercise_version_id,
        prescriptionType: row.prescription_type,
        params: parseExerciseParamsJson(row.params_json),
      });
    }
    await this.sql.run(
      `UPDATE routines SET published_version = ?, draft_updated_at = ? WHERE id = ?`,
      [nextVersion, input.createdAt, input.routineId],
    );
    const saved = await this.findPublishedVersion(input.routineId, nextVersion);
    if (!saved) {
      throw new RoutineRepositoryError("Save published version failed");
    }
    return saved;
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

  async insertRow(input: {
    id: string;
    routineVersionId: string;
    position: number;
    exerciseId: string;
    exerciseVersionId: string;
    prescriptionType: PrescriptionType;
    params: ExerciseParams;
  }): Promise<void> {
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

    await this.sql.run(
      `INSERT INTO routine_version_rows (
        id, routine_version_id, position, exercise_id, exercise_version_id,
        prescription_type, params_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        rowId,
        routineVersionId,
        input.position,
        exerciseId,
        exerciseVersionId,
        input.prescriptionType,
        paramsJson,
      ],
    );
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
    sourceVersionNumber: number;
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
    const sourceVersionId = validateOpaqueEntityId(
      input.sourceRoutineVersionId,
      "Source routine version id",
    );
    if (input.rows.length === 0) {
      throw new RoutineRepositoryError("Cannot save an empty routine copy");
    }

    await this.sql.run(
      `INSERT INTO practitioner_routines (
        id, practitioner_id, routine_id, source_routine_version_id,
        source_version_number, saved_at, last_used_at, edited
      ) VALUES (?, ?, ?, ?, ?, ?, NULL, 0)`,
      [
        copyId,
        input.practitionerId,
        input.routineId,
        sourceVersionId,
        input.sourceVersionNumber,
        input.savedAt,
      ],
    );
    const rowRepo = new PractitionerRoutineRowsRepository(this.sql);
    for (const row of input.rows) {
      await rowRepo.insertRow({
        id: row.id,
        practitionerRoutineId: copyId,
        position: row.position,
        exerciseId: row.exerciseId,
        exerciseVersionId: row.exerciseVersionId,
        prescriptionType: row.prescriptionType,
        params: row.params,
      });
    }
    const saved = await this.findForPractitioner(input.practitionerId, input.routineId);
    if (!saved) {
      throw new RoutineRepositoryError("Save frozen copy failed");
    }
    return saved;
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

  async insertRow(input: {
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
      ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
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
