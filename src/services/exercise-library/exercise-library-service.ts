import { categoryToLabel } from "../../domain/exercise-category-labels.js";
import {
  prescriptionTypesForCategory,
  type PrescriptionType,
} from "../../domain/exercise-types.js";
import {
  libraryTextForKey,
  listLibraryUpdatedTextFields,
  hasAnyTextOverride,
} from "../../domain/library-updated.js";
import {
  applyKeepMine,
  applyUseLibraryVersion,
  parseTextOverridesJson,
  TextOverrideLegacyShapeError,
  TextOverrideValidationError,
  validateTextOverrides,
  TEXT_OVERRIDE_KEYS,
  type LibraryVersionText,
  type TextOverrideKey,
  type TextOverrides,
} from "../../domain/exercise-text-overrides.js";
import {
  ParamValidationError,
  validateParamOverridesForCategory,
  type ParamOverridesByType,
} from "../../domain/exercise-params.js";
import { resolveExerciseParams } from "../../domain/resolve-exercise-params.js";
import { buildWebAppExerciseSearchUrl } from "../../mcp-connector/urls.js";
import type { PhysioServerConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  PractitionerExercisesRepository,
  PractitionersRepository,
} from "../../storage/repositories/exercise-data.js";
import {
  ExerciseLibraryReadRepository,
  PractitionerMyExercisesRepository,
  type ApprovedExerciseSearchSort,
} from "../../storage/repositories/exercise-library-read.js";
import { TypeDefaultsRepository } from "../../storage/repositories/type-defaults.js";
import type {
  ApprovedExerciseSummary,
  ExerciseDetailsResult,
  ExerciseMutationUndo,
  ExerciseSearchSort,
  ExerciseUndoSnapshot,
  MyExerciseListItem,
  MyExercisesListResult,
  ResolvedTextField,
  SearchApprovedExercisesResult,
} from "./types.js";

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 25;

export class ExerciseLibraryServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "practitioner_not_found"
      | "exercise_not_found"
      | "my_exercise_not_found"
      | "invalid_input"
      | "undo_mismatch"
      | "text_overrides_invalid_shape",
  ) {
    super(message);
    this.name = "ExerciseLibraryServiceError";
  }
}

type SearchApprovedInput = {
  practitionerId: string;
  query?: string;
  category?: "Stretching" | "Strengthening";
  bodyRegion?: string;
  prescriptionType?: PrescriptionType;
  sort?: ExerciseSearchSort;
  limit?: number;
  cursor?: string;
};

type CursorPayload = { offset: number };

function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset } satisfies CursorPayload)).toString(
    "base64url",
  );
}

function decodeCursor(cursor: string): number {
  try {
    const parsed = JSON.parse(
      Buffer.from(cursor, "base64url").toString("utf8"),
    ) as CursorPayload;
    if (typeof parsed.offset !== "number" || parsed.offset < 0) {
      throw new Error("invalid");
    }
    return parsed.offset;
  } catch {
    throw new ExerciseLibraryServiceError("Invalid cursor", "invalid_input");
  }
}

function isIsoDateTimeString(value: string): boolean {
  if (Number.isNaN(Date.parse(value))) {
    return false;
  }
  return /^\d{4}-\d{2}-\d{2}T/.test(value);
}

function mapTextOverrideReadError(err: unknown): never {
  if (err instanceof TextOverrideLegacyShapeError) {
    throw new ExerciseLibraryServiceError(
      "Text overrides use an invalid stored shape",
      "text_overrides_invalid_shape",
    );
  }
  if (err instanceof TextOverrideValidationError) {
    throw new ExerciseLibraryServiceError(err.message, "invalid_input");
  }
  throw err;
}

function mapParamValidationError(err: unknown): never {
  if (err instanceof ParamValidationError) {
    throw new ExerciseLibraryServiceError(err.message, "invalid_input");
  }
  throw err;
}

function toLibraryVersionText(row: {
  title: string;
  description: string;
  cue_stretching: string | null;
  cue_isometric: string | null;
  cue_concentric: string | null;
  cue_eccentric: string | null;
}): LibraryVersionText {
  return {
    title: row.title,
    description: row.description,
    cue_stretching: row.cue_stretching,
    cue_isometric: row.cue_isometric,
    cue_concentric: row.cue_concentric,
    cue_eccentric: row.cue_eccentric,
  };
}

function buildResolvedTextFields(
  version: LibraryVersionText,
  overridesJson: string,
): ResolvedTextField[] {
  const overrides = parseStoredTextOverrides(overridesJson);
  const updatedKeys = new Set(listLibraryUpdatedTextFields(overrides, version));
  return TEXT_OVERRIDE_KEYS.map((key) => {
    const libraryValue = libraryTextForKey(version, key);
    const entry = overrides[key];
    return {
      key,
      resolved: entry?.value ?? libraryValue,
      library_value: libraryValue,
      library_updated: entry ? updatedKeys.has(key) : false,
    };
  });
}

function parseStoredTextOverrides(json: string): TextOverrides {
  try {
    return parseTextOverridesJson(json);
  } catch (err) {
    mapTextOverrideReadError(err);
  }
}

function mapSearchRow(
  row: Awaited<ReturnType<ExerciseLibraryReadRepository["searchApproved"]>>[number],
): ApprovedExerciseSummary {
  const bodyRegions = row.body_region_labels
    ? row.body_region_labels.split(", ").filter(Boolean)
    : [];
  return {
    exercise_id: row.exercise_id,
    exercise_version_id: row.exercise_version_id,
    exercise_name: row.title,
    category: categoryToLabel(row.category),
    body_regions: bodyRegions,
    allowed_prescription_types: [...prescriptionTypesForCategory(row.category)],
    matched_alias: row.matched_alias,
    usage_count: row.usage_count,
  };
}

type ListMyExercisesInput = {
  practitionerId: string;
  query?: string;
  category?: "Stretching" | "Strengthening";
  bodyRegion?: string;
};

export class ExerciseLibraryService {
  private readonly libraryRead: ExerciseLibraryReadRepository;
  private readonly myExercisesRead: PractitionerMyExercisesRepository;
  private readonly practitionerExercises: PractitionerExercisesRepository;
  private readonly practitioners: PractitionersRepository;
  private readonly typeDefaults: TypeDefaultsRepository;
  private readonly now: () => string;

  constructor(
    sql: SqlStoragePort,
    private readonly config: PhysioServerConfig,
    options?: { now?: () => string },
  ) {
    this.libraryRead = new ExerciseLibraryReadRepository(sql);
    this.myExercisesRead = new PractitionerMyExercisesRepository(sql);
    this.practitionerExercises = new PractitionerExercisesRepository(sql);
    this.practitioners = new PractitionersRepository(sql);
    this.typeDefaults = new TypeDefaultsRepository(sql);
    this.now = options?.now ?? (() => new Date().toISOString());
  }

  buildExerciseSearchUrl(query: string): string {
    return buildWebAppExerciseSearchUrl(this.config.webAppBaseUrl, query);
  }

  async searchApprovedExercises(
    input: SearchApprovedInput,
  ): Promise<SearchApprovedExercisesResult> {
    await this.requirePractitioner(input.practitionerId);

    const limit = Math.min(
      MAX_SEARCH_LIMIT,
      Math.max(1, input.limit ?? DEFAULT_SEARCH_LIMIT),
    );
    const offset = input.cursor ? decodeCursor(input.cursor) : 0;
    const sort: ApprovedExerciseSearchSort = input.sort ?? "most_used";
    const categoryDb =
      input.category === "Stretching"
        ? "stretch"
        : input.category === "Strengthening"
          ? "strengthening"
          : undefined;

    const totalCount = await this.libraryRead.countApprovedSearch({
      query: input.query,
      category: categoryDb,
      bodyRegionLabel: input.bodyRegion,
      prescriptionType: input.prescriptionType,
    });

    const rows = await this.libraryRead.searchApproved({
      query: input.query,
      category: categoryDb,
      bodyRegionLabel: input.bodyRegion,
      prescriptionType: input.prescriptionType,
      sort,
      limit: limit + 1,
      offset,
    });

    const page = rows.slice(0, limit);
    const nextOffset = offset + page.length;
    const next_cursor =
      rows.length > limit && nextOffset < totalCount ? encodeCursor(nextOffset) : null;

    const trimmedQuery = input.query?.trim() ?? "";
    const search_link =
      page.length === 0 && trimmedQuery.length > 0
        ? this.buildExerciseSearchUrl(trimmedQuery)
        : null;

    return {
      exercises: page.map(mapSearchRow),
      next_cursor,
      search_link,
      total_count: totalCount,
    };
  }

  async getExerciseDetails(
    practitionerId: string,
    exerciseId: string,
  ): Promise<ExerciseDetailsResult> {
    await this.requirePractitioner(practitionerId);
    const version = await this.libraryRead.getLatestApprovedByExerciseId(exerciseId);
    if (!version) {
      throw new ExerciseLibraryServiceError("Exercise not found", "exercise_not_found");
    }

    const bodyRegions =
      await this.libraryRead.listBodyRegionLabelsForExercise(exerciseId);
    const aliases = await this.libraryRead.listAliasesForExercise(exerciseId);
    let myRow: Awaited<ReturnType<PractitionerExercisesRepository["find"]>> = null;
    try {
      myRow = await this.practitionerExercises.find(practitionerId, exerciseId);
    } catch (err) {
      mapTextOverrideReadError(err);
    }
    const libraryVersion = toLibraryVersionText(version);

    const resolvedParamsByType: ExerciseDetailsResult["resolved_params_by_type"] = {};
    const paramOverrides = myRow?.paramOverrides ?? {};
    for (const type of prescriptionTypesForCategory(version.category)) {
      const practitionerDefaults = await this.typeDefaults.getPractitionerDefaults(
        practitionerId,
        type,
      );
      const resolved = resolveExerciseParams({
        prescriptionType: type,
        paramOverrides,
        practitionerTypeDefaults: practitionerDefaults,
      });
      resolvedParamsByType[type] = {
        params: resolved.params,
        source: resolved.source,
      };
    }

    const usage = await this.libraryRead.getUsageCount(exerciseId);

    return {
      exercise_id: exerciseId,
      exercise_version_id: version.id,
      version_number: version.version_number,
      category: categoryToLabel(version.category),
      body_regions: bodyRegions,
      aliases,
      allowed_prescription_types: [...prescriptionTypesForCategory(version.category)],
      usage_count: usage,
      approved_at: version.approved_at,
      media_set_id: version.media_set_id,
      in_my_exercises: myRow !== null,
      favourite: myRow?.favourite ?? false,
      library: {
        title: version.title,
        description: version.description,
        equipment: version.equipment,
        starting_position: version.starting_position,
        steps: version.steps,
        common_mistakes: version.common_mistakes,
        regressions: version.regressions,
        progressions: version.progressions,
        precautions: version.precautions,
        cue_stretching: version.cue_stretching,
        cue_isometric: version.cue_isometric,
        cue_concentric: version.cue_concentric,
        cue_eccentric: version.cue_eccentric,
      },
      resolved_text: buildResolvedTextFields(
        libraryVersion,
        myRow ? serializeOverridesForStorage(myRow.textOverrides) : "{}",
      ),
      param_overrides: paramOverrides,
      resolved_params_by_type: resolvedParamsByType,
    };
  }

  async listMyExercises(input: ListMyExercisesInput): Promise<MyExercisesListResult> {
    await this.requirePractitioner(input.practitionerId);
    const rows = await this.myExercisesRead.listForPractitioner(input.practitionerId);

    const trimmedQuery = input.query?.trim() ?? "";
    const categoryDb =
      input.category === "Stretching"
        ? "stretch"
        : input.category === "Strengthening"
          ? "strengthening"
          : undefined;
    const bodyRegion = input.bodyRegion?.trim();
    const hasFilters = !!(trimmedQuery || categoryDb || bodyRegion);

    const emptySections: MyExercisesListResult["sections"] = {
      new_from_requests: [],
      pinned: [],
      recently_used_and_saved: [],
    };

    if (hasFilters && rows.length === 0) {
      return {
        list_state: "no_saved_exercises_with_filters",
        sections: emptySections,
      };
    }

    let allowedIds: Set<string> | null = null;
    const matchedAliasById = new Map<string, string | null>();

    if (hasFilters) {
      const ids = rows.map((row) => row.exercise_id);
      const searchRows = await this.libraryRead.searchApproved({
        query: trimmedQuery || undefined,
        category: categoryDb,
        bodyRegionLabel: bodyRegion,
        sort: "most_used",
        limit: ids.length,
        offset: 0,
        exerciseIdsIn: ids,
      });
      allowedIds = new Set(searchRows.map((row) => row.exercise_id));
      for (const row of searchRows) {
        matchedAliasById.set(row.exercise_id, row.matched_alias);
      }
      if (allowedIds.size === 0) {
        if (trimmedQuery) {
          return {
            list_state: "nothing_in_my_exercises_matches",
            search_query: trimmedQuery,
            sections: emptySections,
          };
        }
        return {
          list_state: "no_saved_exercises_with_filters",
          sections: emptySections,
        };
      }
    }

    const items: MyExerciseListItem[] = [];
    for (const row of rows) {
      if (allowedIds && !allowedIds.has(row.exercise_id)) {
        continue;
      }
      const version = await this.libraryRead.getLatestApprovedByExerciseId(
        row.exercise_id,
      );
      if (!version) {
        continue;
      }
      const libraryVersion = toLibraryVersionText(version);
      let overrides: TextOverrides;
      try {
        overrides = parseStoredTextOverrides(row.text_overrides_json);
      } catch (err) {
        if (err instanceof ExerciseLibraryServiceError) {
          throw err;
        }
        mapTextOverrideReadError(err);
      }
      const libraryUpdatedFields = listLibraryUpdatedTextFields(
        overrides,
        libraryVersion,
      );
      const bodyRegions = await this.libraryRead.listBodyRegionLabelsForExercise(
        row.exercise_id,
      );

      items.push({
        exercise_id: row.exercise_id,
        exercise_version_id: version.id,
        exercise_name: overrides.title?.value ?? version.title,
        category: categoryToLabel(version.category),
        section: "recently_used_and_saved",
        favourite: row.favourite === 1,
        saved_at: row.saved_at,
        last_used_at: row.last_used_at,
        edited: hasAnyTextOverride(overrides),
        library_updated: libraryUpdatedFields.length > 0,
        library_updated_fields: libraryUpdatedFields,
        matched_alias: hasFilters
          ? (matchedAliasById.get(row.exercise_id) ?? null)
          : null,
        body_regions: bodyRegions,
      });
    }

    const sections: MyExercisesListResult["sections"] = {
      new_from_requests: [],
      pinned: [],
      recently_used_and_saved: [],
    };

    const rowByExerciseId = new Map(rows.map((row) => [row.exercise_id, row]));

    for (const item of items) {
      const source = rowByExerciseId.get(item.exercise_id);
      const isNewFromRequest = !!source?.request_updated_at;
      if (isNewFromRequest) {
        sections.new_from_requests.push({ ...item, section: "new_from_requests" });
      } else if (item.favourite) {
        sections.pinned.push({ ...item, section: "pinned" });
      } else {
        sections.recently_used_and_saved.push(item);
      }
    }

    sections.new_from_requests.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
    sections.pinned.sort((a, b) => b.saved_at.localeCompare(a.saved_at));
    sections.recently_used_and_saved.sort((a, b) => {
      const aUsed = a.last_used_at ?? a.saved_at;
      const bUsed = b.last_used_at ?? b.saved_at;
      return bUsed.localeCompare(aUsed);
    });

    return { list_state: "ok", sections };
  }

  async saveToMyExercises(
    practitionerId: string,
    exerciseId: string,
  ): Promise<{ undo: ExerciseMutationUndo }> {
    await this.requirePractitioner(practitionerId);
    const version = await this.libraryRead.getLatestApprovedByExerciseId(exerciseId);
    if (!version) {
      throw new ExerciseLibraryServiceError("Exercise not found", "exercise_not_found");
    }

    const undo = await this.captureUndoSnapshot(practitionerId, exerciseId);
    const existing = await this.practitionerExercises.find(practitionerId, exerciseId);
    const savedAt = this.now();
    await this.practitionerExercises.upsert({
      practitionerId,
      exerciseId,
      favourite: existing?.favourite ?? false,
      savedAt,
      lastUsedAt: existing?.lastUsedAt ?? null,
      textOverrides: existing?.textOverrides ?? {},
      paramOverrides: existing?.paramOverrides ?? {},
    });
    return { undo };
  }

  async setPinned(
    practitionerId: string,
    exerciseId: string,
    favourite: boolean,
  ): Promise<{ undo: ExerciseMutationUndo }> {
    await this.requirePractitioner(practitionerId);
    const existing = await this.practitionerExercises.find(practitionerId, exerciseId);
    if (!existing) {
      throw new ExerciseLibraryServiceError(
        "Exercise is not in My exercises",
        "my_exercise_not_found",
      );
    }
    const undo = await this.captureUndoSnapshot(practitionerId, exerciseId);
    const updated = await this.myExercisesRead.setFavourite(
      practitionerId,
      exerciseId,
      favourite,
    );
    if (!updated) {
      throw new ExerciseLibraryServiceError(
        "Exercise is not in My exercises",
        "my_exercise_not_found",
      );
    }
    return { undo };
  }

  async removeFromMyExercises(
    practitionerId: string,
    exerciseId: string,
  ): Promise<{ undo: ExerciseMutationUndo }> {
    await this.requirePractitioner(practitionerId);
    const existing = await this.practitionerExercises.find(practitionerId, exerciseId);
    if (!existing) {
      throw new ExerciseLibraryServiceError(
        "Exercise is not in My exercises",
        "my_exercise_not_found",
      );
    }
    const undo = await this.captureUndoSnapshot(practitionerId, exerciseId);
    await this.myExercisesRead.delete(practitionerId, exerciseId);
    return { undo };
  }

  async applyUndo(
    urlPractitionerId: string,
    urlExerciseId: string,
    snapshot: ExerciseMutationUndo,
  ): Promise<void> {
    if (
      snapshot.practitioner_id !== urlPractitionerId ||
      snapshot.exercise_id !== urlExerciseId
    ) {
      throw new ExerciseLibraryServiceError(
        "Undo snapshot does not match URL",
        "undo_mismatch",
      );
    }

    await this.requirePractitioner(urlPractitionerId);
    const snap = snapshot.snapshot;

    if (snap.saved_at !== null && !isIsoDateTimeString(snap.saved_at)) {
      throw new ExerciseLibraryServiceError(
        "Invalid saved_at in undo",
        "invalid_input",
      );
    }
    if (snap.last_used_at !== null && !isIsoDateTimeString(snap.last_used_at)) {
      throw new ExerciseLibraryServiceError(
        "Invalid last_used_at in undo",
        "invalid_input",
      );
    }

    if (!snap.had_row) {
      await this.myExercisesRead.delete(urlPractitionerId, urlExerciseId);
      return;
    }

    const version = await this.libraryRead.getLatestApprovedByExerciseId(urlExerciseId);
    if (!version) {
      throw new ExerciseLibraryServiceError("Exercise not found", "exercise_not_found");
    }

    const overrides = parseStoredTextOverrides(snap.text_overrides_json);
    let paramOverrides: ParamOverridesByType;
    try {
      paramOverrides = validateParamOverridesForCategory(
        version.category,
        JSON.parse(snap.param_overrides_json) as unknown,
      );
    } catch (err) {
      mapParamValidationError(err);
    }

    await this.practitionerExercises.upsert({
      practitionerId: urlPractitionerId,
      exerciseId: urlExerciseId,
      favourite: snap.favourite,
      savedAt: snap.saved_at ?? this.now(),
      lastUsedAt: snap.last_used_at,
      textOverrides: overrides,
      paramOverrides,
    });
  }

  async updateMyCopy(input: {
    practitionerId: string;
    exerciseId: string;
    textOverrides?: TextOverrides;
    paramOverrides?: Record<string, unknown>;
    useLibraryVersion?: TextOverrideKey[];
    keepMine?: TextOverrideKey[];
  }): Promise<{ undo: ExerciseMutationUndo }> {
    await this.requirePractitioner(input.practitionerId);
    const version = await this.libraryRead.getLatestApprovedByExerciseId(
      input.exerciseId,
    );
    if (!version) {
      throw new ExerciseLibraryServiceError("Exercise not found", "exercise_not_found");
    }
    const existing = await this.practitionerExercises.find(
      input.practitionerId,
      input.exerciseId,
    );
    if (!existing) {
      throw new ExerciseLibraryServiceError(
        "Exercise is not in My exercises",
        "my_exercise_not_found",
      );
    }

    const undo = await this.captureUndoSnapshot(input.practitionerId, input.exerciseId);
    const libraryVersion = toLibraryVersionText(version);
    let overrides = { ...existing.textOverrides };

    for (const key of input.useLibraryVersion ?? []) {
      overrides = applyUseLibraryVersion(overrides, key);
    }
    for (const key of input.keepMine ?? []) {
      overrides = applyKeepMine(overrides, key, libraryTextForKey(libraryVersion, key));
    }

    if (input.textOverrides) {
      try {
        overrides = validateTextOverrides({ ...overrides, ...input.textOverrides });
      } catch (err) {
        if (err instanceof TextOverrideLegacyShapeError) {
          throw new ExerciseLibraryServiceError(
            "Text overrides use an invalid stored shape",
            "text_overrides_invalid_shape",
          );
        }
        mapTextOverrideReadError(err);
      }
    }

    let paramOverrides = existing.paramOverrides;
    if (input.paramOverrides) {
      try {
        paramOverrides = validateParamOverridesForCategory(version.category, {
          ...paramOverrides,
          ...(input.paramOverrides as ParamOverridesByType),
        });
      } catch (err) {
        mapParamValidationError(err);
      }
    }

    await this.practitionerExercises.upsert({
      practitionerId: input.practitionerId,
      exerciseId: input.exerciseId,
      favourite: existing.favourite,
      savedAt: existing.savedAt,
      lastUsedAt: existing.lastUsedAt,
      textOverrides: overrides,
      paramOverrides,
    });

    return { undo };
  }

  private async requirePractitioner(practitionerId: string): Promise<void> {
    const row = await this.practitioners.findById(practitionerId);
    if (!row) {
      throw new ExerciseLibraryServiceError(
        "Practitioner not found",
        "practitioner_not_found",
      );
    }
  }

  private async captureUndoSnapshot(
    practitionerId: string,
    exerciseId: string,
  ): Promise<ExerciseMutationUndo> {
    const existing = await this.practitionerExercises.find(practitionerId, exerciseId);
    const snapshot: ExerciseUndoSnapshot = existing
      ? {
          had_row: true,
          favourite: existing.favourite,
          saved_at: existing.savedAt,
          last_used_at: existing.lastUsedAt,
          text_overrides_json: serializeOverridesForStorage(existing.textOverrides),
          param_overrides_json: JSON.stringify(existing.paramOverrides),
        }
      : {
          had_row: false,
          favourite: false,
          saved_at: null,
          last_used_at: null,
          text_overrides_json: "{}",
          param_overrides_json: "{}",
        };
    return { practitioner_id: practitionerId, exercise_id: exerciseId, snapshot };
  }
}

function serializeOverridesForStorage(
  overrides: ReturnType<typeof parseTextOverridesJson>,
): string {
  return JSON.stringify(overrides);
}
