import type { SqlStoragePort } from "../ports/sql-storage.js";
import {
  PRESCRIPTION_TYPES,
  type PrescriptionType,
} from "../../domain/exercise-types.js";
import {
  parseExerciseParamsJson,
  validateExerciseParams,
  type ExerciseParams,
} from "../../domain/exercise-params.js";
import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";

export type TypeDefaultsRow = {
  scope: "global" | "practitioner";
  practitioner_id: string | null;
  type: PrescriptionType;
  params_json: string;
};

export class TypeDefaultsRepository {
  constructor(private readonly sql: SqlStoragePort) {}

  async listGlobalDefaults(): Promise<Record<PrescriptionType, ExerciseParams>> {
    const rows = await this.sql.all<TypeDefaultsRow>(
      "SELECT scope, practitioner_id, type, params_json FROM type_defaults WHERE scope = ?",
      ["global"],
    );
    const result = Object.fromEntries(
      PRESCRIPTION_TYPES.map((type) => [type, {}]),
    ) as Record<PrescriptionType, ExerciseParams>;
    for (const row of rows) {
      result[row.type] = parseExerciseParamsJson(row.params_json);
    }
    return result;
  }

  async getPractitionerDefaults(
    practitionerId: string,
    type: PrescriptionType,
  ): Promise<ExerciseParams> {
    const row = await this.sql.first<{ params_json: string }>(
      "SELECT params_json FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ? LIMIT 1",
      ["practitioner", practitionerId, type],
    );
    if (!row) {
      return {};
    }
    return parseExerciseParamsJson(row.params_json);
  }

  async upsertPractitionerDefaults(
    id: string,
    practitionerId: string,
    type: PrescriptionType,
    params: ExerciseParams,
  ): Promise<void> {
    const opaqueId = validateOpaqueEntityId(id, "Type default id");
    const opaquePractitionerId = validateOpaqueEntityId(
      practitionerId,
      "Practitioner id",
    );
    const validated = validateExerciseParams(params);
    await this.sql.run(
      `INSERT INTO type_defaults (id, scope, practitioner_id, type, params_json)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(practitioner_id, type) WHERE scope = 'practitioner' DO UPDATE SET params_json = excluded.params_json`,
      [opaqueId, "practitioner", opaquePractitionerId, type, JSON.stringify(validated)],
    );
  }

  async deletePractitionerDefaults(
    practitionerId: string,
    type: PrescriptionType,
  ): Promise<void> {
    await this.sql.run(
      "DELETE FROM type_defaults WHERE scope = ? AND practitioner_id = ? AND type = ?",
      ["practitioner", practitionerId, type],
    );
  }
}
