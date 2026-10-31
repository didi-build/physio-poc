import type {
  SqlBatchStatement,
  SqlStoragePort,
  SqlValue,
} from "../ports/sql-storage.js";
import type {
  ExerciseCategory,
  ExerciseRequestStatus,
  VersionStatus,
} from "../../domain/exercise-types.js";
import {
  validateChangeSummary,
  validateExerciseAlias,
  validateExerciseCue,
  validateExerciseTemplateText,
  validateExerciseTitle,
  validateRequestNote,
  validateRequestedExerciseName,
} from "../../domain/exercise-free-text.js";
import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import {
  parseTextOverridesJson,
  serializeTextOverrides,
  validateTextOverrides,
  type TextOverrides,
} from "../../domain/exercise-text-overrides.js";
import {
  validateParamOverridesByType,
  type ParamOverridesByType,
} from "../../domain/exercise-params.js";

export type PractitionerRow = {
  id: string;
  email: string;
  created_at: string;
};

export class PractitionersRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async insert(row: PractitionerRow): Promise<void> {
    const id = validateOpaqueEntityId(row.id, "Practitioner id");
    await this.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [id, row.email, row.created_at],
    );
  }

  async findById(id: string): Promise<PractitionerRow | null> {
    return this.sql.first<PractitionerRow>(
      "SELECT id, email, created_at FROM practitioners WHERE id = ? LIMIT 1",
      [id],
    );
  }
}

export class PractitionerExercisesRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async upsert(input: {
    practitionerId: string;
    exerciseId: string;
    favourite?: boolean;
    savedAt: string;
    lastUsedAt?: string | null;
    textOverrides?: TextOverrides;
    paramOverrides?: ParamOverridesByType;
  }): Promise<void> {
    const textOverrides = validateTextOverrides(input.textOverrides ?? {});
    const paramOverrides = validateParamOverridesByType(input.paramOverrides ?? {});
    const practitionerId = validateOpaqueEntityId(
      input.practitionerId,
      "Practitioner id",
    );
    const exerciseId = validateOpaqueEntityId(input.exerciseId, "Exercise id");
    const textJson = serializeTextOverrides(textOverrides);
    const paramJson = JSON.stringify(paramOverrides);

    await this.sql.run(
      `INSERT INTO practitioner_exercises (
        practitioner_id, exercise_id, favourite, saved_at, last_used_at,
        text_overrides_json, param_overrides_json
      ) VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(practitioner_id, exercise_id) DO UPDATE SET
        favourite = excluded.favourite,
        saved_at = excluded.saved_at,
        last_used_at = excluded.last_used_at,
        text_overrides_json = excluded.text_overrides_json,
        param_overrides_json = excluded.param_overrides_json`,
      [
        practitionerId,
        exerciseId,
        input.favourite ? 1 : 0,
        input.savedAt,
        input.lastUsedAt ?? null,
        textJson,
        paramJson,
      ],
    );
  }

  buildSaveExerciseBatchStatement(input: {
    practitionerId: string;
    exerciseId: string;
    savedAt: string;
  }): SqlBatchStatement {
    const practitionerId = validateOpaqueEntityId(
      input.practitionerId,
      "Practitioner id",
    );
    const exerciseId = validateOpaqueEntityId(input.exerciseId, "Exercise id");
    const textJson = serializeTextOverrides({});
    const paramJson = JSON.stringify(validateParamOverridesByType({}));
    return {
      sql: `INSERT INTO practitioner_exercises (
        practitioner_id, exercise_id, favourite, saved_at, last_used_at,
        text_overrides_json, param_overrides_json
      ) VALUES (?, ?, 0, ?, NULL, ?, ?)
      ON CONFLICT(practitioner_id, exercise_id) DO UPDATE SET
        saved_at = excluded.saved_at`,
      bindings: [practitionerId, exerciseId, input.savedAt, textJson, paramJson],
      minRowsAffected: 1,
    };
  }

  async find(
    practitionerId: string,
    exerciseId: string,
  ): Promise<{
    favourite: boolean;
    savedAt: string;
    lastUsedAt: string | null;
    textOverrides: TextOverrides;
    paramOverrides: ParamOverridesByType;
  } | null> {
    const row = await this.sql.first<{
      favourite: number;
      saved_at: string;
      last_used_at: string | null;
      text_overrides_json: string;
      param_overrides_json: string;
    }>(
      `SELECT favourite, saved_at, last_used_at, text_overrides_json, param_overrides_json
       FROM practitioner_exercises
       WHERE practitioner_id = ? AND exercise_id = ? LIMIT 1`,
      [practitionerId, exerciseId],
    );
    if (!row) {
      return null;
    }
    return {
      favourite: row.favourite === 1,
      savedAt: row.saved_at,
      lastUsedAt: row.last_used_at,
      textOverrides: parseTextOverridesJson(row.text_overrides_json),
      paramOverrides: validateParamOverridesByType(
        JSON.parse(row.param_overrides_json) as unknown,
      ),
    };
  }
}

export type ExerciseRow = {
  id: string;
  category: ExerciseCategory;
  created_by: string;
  created_at: string;
};

export class ExercisesRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async insert(row: ExerciseRow): Promise<void> {
    const id = validateOpaqueEntityId(row.id, "Exercise id");
    const createdBy = validateOpaqueEntityId(row.created_by, "Practitioner id");
    await this.sql.run(
      "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
      [id, row.category, createdBy, row.created_at],
    );
  }
}

export type BodyRegionRow = {
  id: string;
  label: string;
};

export class BodyRegionsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async listAll(): Promise<BodyRegionRow[]> {
    return this.sql.all<BodyRegionRow>(
      "SELECT id, label FROM body_regions ORDER BY label ASC",
    );
  }
}

export type ExerciseVersionInsert = {
  id: string;
  exerciseId: string;
  versionNumber: number;
  status: VersionStatus;
  approvedBy: string | null;
  approvedAt: string | null;
  title: string;
  description?: string;
  equipment?: string;
  startingPosition?: string;
  steps?: string;
  commonMistakes?: string;
  regressions?: string;
  progressions?: string;
  precautions?: string;
  cueStretching?: string | null;
  cueIsometric?: string | null;
  cueConcentric?: string | null;
  cueEccentric?: string | null;
  mediaSetId?: string | null;
  changeSummary?: string | null;
  createdAt: string;
};

export class ExerciseVersionsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async findById(id: string): Promise<{
    id: string;
    exercise_id: string;
    version_number: number;
    status: VersionStatus;
    title: string;
  } | null> {
    return this.sql.first(
      `SELECT id, exercise_id, version_number, status, title
       FROM exercise_versions WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  async findDraftForExercise(
    exerciseId: string,
  ): Promise<{ id: string; version_number: number; title: string } | null> {
    return this.sql.first(
      `SELECT id, version_number, title
       FROM exercise_versions
       WHERE exercise_id = ? AND status = 'draft'
       ORDER BY version_number DESC
       LIMIT 1`,
      [exerciseId],
    );
  }

  async findDraftVersionDetailForExercise(exerciseId: string): Promise<{
    id: string;
    version_number: number;
    title: string;
    description: string;
    equipment: string;
    starting_position: string;
    steps: string;
    common_mistakes: string;
    regressions: string;
    progressions: string;
    precautions: string;
    cue_stretching: string | null;
    cue_isometric: string | null;
    cue_concentric: string | null;
    cue_eccentric: string | null;
  } | null> {
    return this.sql.first(
      `SELECT id, version_number, title, description, equipment, starting_position, steps,
              common_mistakes, regressions, progressions, precautions,
              cue_stretching, cue_isometric, cue_concentric, cue_eccentric
       FROM exercise_versions
       WHERE exercise_id = ? AND status = 'draft'
       ORDER BY version_number DESC LIMIT 1`,
      [exerciseId],
    );
  }

  async updateDraftFields(
    versionId: string,
    patch: Partial<{
      title: string;
      description: string;
      equipment: string;
      startingPosition: string;
      steps: string;
      commonMistakes: string;
      regressions: string;
      progressions: string;
      precautions: string;
      cueStretching: string | null;
      cueIsometric: string | null;
      cueConcentric: string | null;
      cueEccentric: string | null;
    }>,
  ): Promise<boolean> {
    const sets: string[] = [];
    const bindings: SqlValue[] = [];
    if (patch.title !== undefined) {
      sets.push("title = ?");
      bindings.push(validateExerciseTitle(patch.title));
    }
    if (patch.description !== undefined) {
      sets.push("description = ?");
      bindings.push(validateExerciseTemplateText(patch.description, "Description"));
    }
    if (patch.equipment !== undefined) {
      sets.push("equipment = ?");
      bindings.push(validateExerciseTemplateText(patch.equipment, "Equipment"));
    }
    if (patch.startingPosition !== undefined) {
      sets.push("starting_position = ?");
      bindings.push(
        validateExerciseTemplateText(patch.startingPosition, "Starting position"),
      );
    }
    if (patch.steps !== undefined) {
      sets.push("steps = ?");
      bindings.push(validateExerciseTemplateText(patch.steps, "Steps"));
    }
    if (patch.commonMistakes !== undefined) {
      sets.push("common_mistakes = ?");
      bindings.push(
        validateExerciseTemplateText(patch.commonMistakes, "Common mistakes"),
      );
    }
    if (patch.regressions !== undefined) {
      sets.push("regressions = ?");
      bindings.push(validateExerciseTemplateText(patch.regressions, "Regressions"));
    }
    if (patch.progressions !== undefined) {
      sets.push("progressions = ?");
      bindings.push(validateExerciseTemplateText(patch.progressions, "Progressions"));
    }
    if (patch.precautions !== undefined) {
      sets.push("precautions = ?");
      bindings.push(validateExerciseTemplateText(patch.precautions, "Precautions"));
    }
    if (patch.cueStretching !== undefined) {
      sets.push("cue_stretching = ?");
      bindings.push(
        patch.cueStretching === null
          ? null
          : validateExerciseCue(patch.cueStretching, "cue_stretching"),
      );
    }
    if (patch.cueIsometric !== undefined) {
      sets.push("cue_isometric = ?");
      bindings.push(
        patch.cueIsometric === null
          ? null
          : validateExerciseCue(patch.cueIsometric, "cue_isometric"),
      );
    }
    if (patch.cueConcentric !== undefined) {
      sets.push("cue_concentric = ?");
      bindings.push(
        patch.cueConcentric === null
          ? null
          : validateExerciseCue(patch.cueConcentric, "cue_concentric"),
      );
    }
    if (patch.cueEccentric !== undefined) {
      sets.push("cue_eccentric = ?");
      bindings.push(
        patch.cueEccentric === null
          ? null
          : validateExerciseCue(patch.cueEccentric, "cue_eccentric"),
      );
    }
    if (sets.length === 0) {
      return false;
    }
    bindings.push(versionId);
    const result = await this.sql.run(
      `UPDATE exercise_versions SET ${sets.join(", ")}
       WHERE id = ? AND status = 'draft'`,
      bindings,
    );
    return result.rowsAffected > 0;
  }

  async approveDraft(input: {
    versionId: string;
    approvedBy: string;
    approvedAt: string;
  }): Promise<boolean> {
    const result = await this.sql.run(
      `UPDATE exercise_versions
       SET status = 'approved', approved_by = ?, approved_at = ?
       WHERE id = ? AND status = 'draft'`,
      [input.approvedBy, input.approvedAt, input.versionId],
    );
    return result.rowsAffected > 0;
  }

  buildApproveDraftBatchStatement(input: {
    versionId: string;
    approvedBy: string;
    approvedAt: string;
  }): SqlBatchStatement {
    const versionId = validateOpaqueEntityId(input.versionId, "Exercise version id");
    const approvedBy = validateOpaqueEntityId(input.approvedBy, "Practitioner id");
    return {
      sql: `UPDATE exercise_versions
       SET status = 'approved', approved_by = ?, approved_at = ?
       WHERE id = ? AND status = 'draft'`,
      bindings: [approvedBy, input.approvedAt, versionId],
      minRowsAffected: 1,
    };
  }

  async insert(input: ExerciseVersionInsert): Promise<void> {
    const id = validateOpaqueEntityId(input.id, "Exercise version id");
    const exerciseId = validateOpaqueEntityId(input.exerciseId, "Exercise id");
    const approvedBy =
      input.approvedBy === null
        ? null
        : validateOpaqueEntityId(input.approvedBy, "Practitioner id");
    const mediaSetId =
      input.mediaSetId === null || input.mediaSetId === undefined
        ? null
        : validateOpaqueEntityId(input.mediaSetId, "Media set id");
    const title = validateExerciseTitle(input.title);
    const description = validateExerciseTemplateText(
      input.description ?? "",
      "Description",
    );
    const equipment = validateExerciseTemplateText(input.equipment ?? "", "Equipment");
    const startingPosition = validateExerciseTemplateText(
      input.startingPosition ?? "",
      "Starting position",
    );
    const steps = validateExerciseTemplateText(input.steps ?? "", "Steps");
    const commonMistakes = validateExerciseTemplateText(
      input.commonMistakes ?? "",
      "Common mistakes",
    );
    const regressions = validateExerciseTemplateText(
      input.regressions ?? "",
      "Regressions",
    );
    const progressions = validateExerciseTemplateText(
      input.progressions ?? "",
      "Progressions",
    );
    const precautions = validateExerciseTemplateText(
      input.precautions ?? "",
      "Precautions",
    );
    const cueStretching =
      input.cueStretching === null || input.cueStretching === undefined
        ? null
        : validateExerciseCue(input.cueStretching, "cue_stretching");
    const cueIsometric =
      input.cueIsometric === null || input.cueIsometric === undefined
        ? null
        : validateExerciseCue(input.cueIsometric, "cue_isometric");
    const cueConcentric =
      input.cueConcentric === null || input.cueConcentric === undefined
        ? null
        : validateExerciseCue(input.cueConcentric, "cue_concentric");
    const cueEccentric =
      input.cueEccentric === null || input.cueEccentric === undefined
        ? null
        : validateExerciseCue(input.cueEccentric, "cue_eccentric");
    const changeSummary = validateChangeSummary(input.changeSummary);

    await this.sql.run(
      `INSERT INTO exercise_versions (
        id, exercise_id, version_number, status, approved_by, approved_at,
        title, description, equipment, starting_position, steps,
        common_mistakes, regressions, progressions, precautions,
        cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
        media_set_id, change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        exerciseId,
        input.versionNumber,
        input.status,
        approvedBy,
        input.approvedAt,
        title,
        description,
        equipment,
        startingPosition,
        steps,
        commonMistakes,
        regressions,
        progressions,
        precautions,
        cueStretching,
        cueIsometric,
        cueConcentric,
        cueEccentric,
        mediaSetId,
        changeSummary,
        input.createdAt,
      ],
    );
  }
}

export class ExerciseAliasesRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async insert(input: {
    id: string;
    exerciseId: string;
    alias: string;
    createdAt: string;
  }): Promise<void> {
    const id = validateOpaqueEntityId(input.id, "Exercise alias id");
    const exerciseId = validateOpaqueEntityId(input.exerciseId, "Exercise id");
    const alias = validateExerciseAlias(input.alias);
    await this.sql.run(
      "INSERT INTO exercise_aliases (id, exercise_id, alias, created_at) VALUES (?, ?, ?, ?)",
      [id, exerciseId, alias, input.createdAt],
    );
  }

  async aliasExistsCaseInsensitive(alias: string): Promise<boolean> {
    const normalized = validateExerciseAlias(alias);
    const row = await this.sql.first<{ one: number }>(
      `SELECT 1 AS one FROM exercise_aliases WHERE alias = ? COLLATE NOCASE LIMIT 1`,
      [normalized],
    );
    return row !== null;
  }

  buildInsertBatchStatement(input: {
    id: string;
    exerciseId: string;
    alias: string;
    createdAt: string;
  }): SqlBatchStatement {
    const id = validateOpaqueEntityId(input.id, "Exercise alias id");
    const exerciseId = validateOpaqueEntityId(input.exerciseId, "Exercise id");
    const alias = validateExerciseAlias(input.alias);
    return {
      sql: "INSERT INTO exercise_aliases (id, exercise_id, alias, created_at) VALUES (?, ?, ?, ?)",
      bindings: [id, exerciseId, alias, input.createdAt],
      minRowsAffected: 1,
    };
  }
}

export class ExerciseBodyRegionsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async link(exerciseId: string, bodyRegionId: string): Promise<void> {
    const opaqueExerciseId = validateOpaqueEntityId(exerciseId, "Exercise id");
    await this.sql.run(
      "INSERT INTO exercise_body_regions (exercise_id, body_region_id) VALUES (?, ?)",
      [opaqueExerciseId, bodyRegionId],
    );
  }
}

export class ExerciseRequestsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async findById(requestId: string): Promise<{
    id: string;
    requested_name: string;
    note: string | null;
    requested_by: string;
    status: ExerciseRequestStatus;
    exercise_id: string | null;
    created_at: string;
    updated_at: string;
  } | null> {
    const id = validateOpaqueEntityId(requestId, "Exercise request id");
    return this.sql.first(
      `SELECT id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
       FROM exercise_requests WHERE id = ? LIMIT 1`,
      [id],
    );
  }

  async insert(input: {
    id: string;
    requestedName: string;
    note?: string | null;
    requestedBy: string;
    status: ExerciseRequestStatus;
    exerciseId?: string | null;
    createdAt: string;
    updatedAt: string;
  }): Promise<void> {
    const id = validateOpaqueEntityId(input.id, "Exercise request id");
    const requestedName = validateRequestedExerciseName(input.requestedName);
    const note = validateRequestNote(input.note);
    const requestedBy = validateOpaqueEntityId(input.requestedBy, "Practitioner id");
    const exerciseId =
      input.exerciseId === null || input.exerciseId === undefined
        ? null
        : validateOpaqueEntityId(input.exerciseId, "Exercise id");
    await this.sql.run(
      `INSERT INTO exercise_requests (
        id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        id,
        requestedName,
        note,
        requestedBy,
        input.status,
        exerciseId,
        input.createdAt,
        input.updatedAt,
      ],
    );
  }

  async updateAfterDraftLink(input: {
    id: string;
    status: ExerciseRequestStatus;
    exerciseId: string;
    updatedAt: string;
  }): Promise<boolean> {
    const result = await this.sql.run(
      `UPDATE exercise_requests
       SET status = ?, exercise_id = ?, updated_at = ?
       WHERE id = ? AND status IN ('open', 'drafting')`,
      [input.status, input.exerciseId, input.updatedAt, input.id],
    );
    return result.rowsAffected > 0;
  }

  async updateStatus(input: {
    id: string;
    status: ExerciseRequestStatus;
    updatedAt: string;
    allowedFromStatuses?: readonly ExerciseRequestStatus[];
  }): Promise<boolean> {
    const allowed = input.allowedFromStatuses;
    const statusFilter =
      allowed && allowed.length > 0
        ? ` AND status IN (${allowed.map(() => "?").join(", ")})`
        : "";
    const bindings: SqlValue[] = [input.status, input.updatedAt, input.id];
    if (allowed && allowed.length > 0) {
      bindings.push(...allowed);
    }
    const result = await this.sql.run(
      `UPDATE exercise_requests SET status = ?, updated_at = ? WHERE id = ?${statusFilter}`,
      bindings,
    );
    return result.rowsAffected > 0;
  }

  buildUpdateStatusBatchStatement(input: {
    id: string;
    status: ExerciseRequestStatus;
    updatedAt: string;
    allowedFromStatuses?: readonly ExerciseRequestStatus[];
  }): SqlBatchStatement {
    const id = validateOpaqueEntityId(input.id, "Exercise request id");
    const allowed = input.allowedFromStatuses;
    const statusFilter =
      allowed && allowed.length > 0
        ? ` AND status IN (${allowed.map(() => "?").join(", ")})`
        : "";
    const bindings: SqlValue[] = [input.status, input.updatedAt, id];
    if (allowed && allowed.length > 0) {
      bindings.push(...allowed);
    }
    return {
      sql: `UPDATE exercise_requests SET status = ?, updated_at = ? WHERE id = ?${statusFilter}`,
      bindings,
      minRowsAffected: 1,
    };
  }

  async updateNote(input: {
    id: string;
    note: string | null;
    updatedAt: string;
  }): Promise<boolean> {
    const note = validateRequestNote(input.note);
    const result = await this.sql.run(
      `UPDATE exercise_requests SET note = ?, updated_at = ? WHERE id = ?`,
      [note, input.updatedAt, input.id],
    );
    return result.rowsAffected > 0;
  }

  buildUpdateNoteBatchStatement(input: {
    id: string;
    note: string | null;
    updatedAt: string;
  }): SqlBatchStatement {
    const id = validateOpaqueEntityId(input.id, "Exercise request id");
    const note = validateRequestNote(input.note);
    return {
      sql: `UPDATE exercise_requests SET note = ?, updated_at = ? WHERE id = ?`,
      bindings: [note, input.updatedAt, id],
      minRowsAffected: 1,
    };
  }

  async countInProgress(): Promise<number> {
    const row = await this.sql.first<{ count: number }>(
      `SELECT COUNT(*) AS count FROM exercise_requests
       WHERE status IN ('open', 'drafting')`,
    );
    return row?.count ?? 0;
  }
}
