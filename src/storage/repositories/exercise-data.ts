import type { SqlStoragePort } from "../ports/sql-storage.js";
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
    await this.sql.run(
      "INSERT INTO practitioners (id, email, created_at) VALUES (?, ?, ?)",
      [row.id, row.email, row.created_at],
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
        input.practitionerId,
        input.exerciseId,
        input.favourite ? 1 : 0,
        input.savedAt,
        input.lastUsedAt ?? null,
        textJson,
        paramJson,
      ],
    );
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
    await this.sql.run(
      "INSERT INTO exercises (id, category, created_by, created_at) VALUES (?, ?, ?, ?)",
      [row.id, row.category, row.created_by, row.created_at],
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

  async insert(input: ExerciseVersionInsert): Promise<void> {
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
        input.id,
        input.exerciseId,
        input.versionNumber,
        input.status,
        input.approvedBy,
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
        input.mediaSetId ?? null,
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
    const alias = validateExerciseAlias(input.alias);
    await this.sql.run(
      "INSERT INTO exercise_aliases (id, exercise_id, alias, created_at) VALUES (?, ?, ?, ?)",
      [input.id, input.exerciseId, alias, input.createdAt],
    );
  }
}

export class ExerciseBodyRegionsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async link(exerciseId: string, bodyRegionId: string): Promise<void> {
    await this.sql.run(
      "INSERT INTO exercise_body_regions (exercise_id, body_region_id) VALUES (?, ?)",
      [exerciseId, bodyRegionId],
    );
  }
}

export class ExerciseRequestsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

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
    const requestedName = validateRequestedExerciseName(input.requestedName);
    const note = validateRequestNote(input.note);
    await this.sql.run(
      `INSERT INTO exercise_requests (
        id, requested_name, note, requested_by, status, exercise_id, created_at, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        input.id,
        requestedName,
        note,
        input.requestedBy,
        input.status,
        input.exerciseId ?? null,
        input.createdAt,
        input.updatedAt,
      ],
    );
  }
}
