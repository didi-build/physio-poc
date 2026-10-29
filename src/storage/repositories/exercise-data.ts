import type { SqlStoragePort } from "../ports/sql-storage.js";
import type { ExerciseCategory } from "../../domain/exercise-types.js";
import {
  parseTextOverridesJson,
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

export type PractitionerExerciseRow = {
  practitioner_id: string;
  exercise_id: string;
  favourite: number;
  saved_at: string;
  last_used_at: string | null;
  text_overrides_json: string;
  param_overrides_json: string;
};

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
    const textJson = JSON.stringify(input.textOverrides ?? {});
    const paramJson = JSON.stringify(input.paramOverrides ?? {});
    validateTextOverrides(JSON.parse(textJson) as unknown);
    validateParamOverridesByType(JSON.parse(paramJson) as unknown);

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
    const row = await this.sql.first<PractitionerExerciseRow>(
      `SELECT practitioner_id, exercise_id, favourite, saved_at, last_used_at,
              text_overrides_json, param_overrides_json
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
