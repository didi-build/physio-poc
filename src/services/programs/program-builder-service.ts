import { FreeTextValidationError } from "../../domain/exercise-free-text.js";
import {
  OpaqueEntityIdValidationError,
  validateOpaqueEntityId,
} from "../../domain/opaque-entity-id.js";
import {
  PRESCRIPTION_TYPES,
  prescriptionTypesForCategory,
  type PrescriptionType,
} from "../../domain/exercise-types.js";
import {
  ParamValidationError,
  validateExerciseParams,
  type ExerciseParams,
} from "../../domain/exercise-params.js";
import { parseExerciseParamsJson } from "../../domain/exercise-params.js";
import { parseProgramRowTextSnapshotJson } from "../../domain/program-types.js";
import * as programCodeDomain from "../../domain/program-code.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  ExerciseRequestsRepository,
  PractitionersRepository,
  PractitionerExercisesRepository,
} from "../../storage/repositories/exercise-data.js";
import {
  ExerciseLibraryReadRepository,
  type LatestApprovedVersionRow,
} from "../../storage/repositories/exercise-library-read.js";
import {
  PROGRAM_RESTORE_AND_PURGE_WINDOW_MS,
  ProgramRepositoryError,
  ProgramRowsRepository,
  ProgramsRepository,
  ShareLinksRepository,
  type ProgramRecord,
  type ProgramRow,
} from "../../storage/repositories/programs.js";
import { TypeDefaultsRepository } from "../../storage/repositories/type-defaults.js";
import { resolveExerciseParams } from "../../domain/resolve-exercise-params.js";
import {
  buildProgramRowTextSnapshot,
  parsePractitionerTextOverrides,
  resolveParamsForProgramRow,
} from "./row-resolution.js";
import type {
  ProgramAutoSaveStatus,
  ProgramBuilderRow,
  ProgramBuilderView,
  ProgramLibraryUpdatePrompt,
  ProgramListItem,
  ProgramMutationResult,
  ProgramSearchResult,
} from "./types.js";

export class ProgramBuilderServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "practitioner_not_found"
      | "program_not_found"
      | "program_row_not_found"
      | "exercise_not_found"
      | "exercise_request_not_found"
      | "invalid_input"
      | "restore_window_expired"
      | "forbidden",
  ) {
    super(message);
    this.name = "ProgramBuilderServiceError";
  }
}

export class ProgramBuilderService {
  private readonly programs: ProgramsRepository;
  private readonly rows: ProgramRowsRepository;
  private readonly links: ShareLinksRepository;
  private readonly practitioners: PractitionersRepository;
  private readonly practitionerExercises: PractitionerExercisesRepository;
  private readonly exerciseRequests: ExerciseRequestsRepository;
  private readonly libraryRead: ExerciseLibraryReadRepository;
  private readonly typeDefaults: TypeDefaultsRepository;

  constructor(
    sql: SqlStoragePort,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {
    this.programs = new ProgramsRepository(sql);
    this.rows = new ProgramRowsRepository(sql);
    this.links = new ShareLinksRepository(sql);
    this.practitioners = new PractitionersRepository(sql);
    this.practitionerExercises = new PractitionerExercisesRepository(sql);
    this.exerciseRequests = new ExerciseRequestsRepository(sql);
    this.libraryRead = new ExerciseLibraryReadRepository(sql);
    this.typeDefaults = new TypeDefaultsRepository(sql);
  }

  async createProgram(
    practitionerId: string,
    input: { programId: string; name?: string | null },
  ): Promise<ProgramMutationResult> {
    await this.requirePractitioner(practitionerId);
    const programId = this.parseOpaqueId(input.programId, "Program id");
    const createdAt = this.now();
    try {
      await this.programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt,
        name: input.name ?? null,
      });
    } catch (err) {
      this.mapFreeTextError(err);
    }
    return { program: await this.buildProgramView(practitionerId, programId) };
  }

  async getProgram(
    practitionerId: string,
    programId: string,
  ): Promise<ProgramBuilderView> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    await this.requirePractitioner(practitionerId);
    const program = await this.requireOwnedProgram(practitionerId, validatedProgramId, {
      allowDeleted: true,
    });
    return this.buildProgramView(practitionerId, validatedProgramId, program);
  }

  /**
   * Links placeholder program rows to an approved exercise version.
   *
   * Uses the caller's `SqlStoragePort` (or active transaction on that port) only;
   * does not begin, commit, or roll back a transaction.
   *
   * The exercise request approval flow (for example DIDI-1004 `approveRequest`) must
   * Replaces matching placeholder rows; returns how many placeholders were skipped because
   * prescriptionType does not fit the approved exercise category (those rows stay placeholders).
   */
  async linkApprovedPlaceholders(
    exerciseRequestId: string,
    approvedVersionId: string,
  ): Promise<number> {
    const requestId = this.parseOpaqueId(exerciseRequestId, "Exercise request id");
    const versionId = this.parseOpaqueId(approvedVersionId, "Exercise version id");
    const rows = await this.rows.listForExerciseRequestId(requestId);
    if (rows.length === 0) {
      return 0;
    }
    const version = await this.libraryRead.getApprovedVersionById(versionId);
    if (!version) {
      throw new ProgramBuilderServiceError("Exercise not found", "exercise_not_found");
    }
    const request = await this.exerciseRequests.findById(requestId);
    if (!request?.exercise_id || request.exercise_id !== version.exercise_id) {
      throw new ProgramBuilderServiceError(
        "approvedVersionId does not match the exercise request",
        "invalid_input",
      );
    }
    const draftUpdatedAt = this.now();
    let skippedCount = 0;
    for (const row of rows) {
      const program = await this.programs.findById(row.program_id);
      if (!program || program.deleted_at) {
        continue;
      }
      if (!this.prescriptionTypeAllowed(version, row.prescription_type)) {
        skippedCount += 1;
        continue;
      }
      const resolved = await this.resolveRowDefaults(
        program.created_by,
        version,
        row.prescription_type,
      );
      const params = parseExerciseParamsJson(row.params_json);
      const textSnapshot = buildProgramRowTextSnapshot({
        version,
        overrides: resolved.overrides,
        prescriptionType: row.prescription_type,
      });
      await this.rows.replaceRow({
        id: row.id,
        programId: row.program_id,
        position: row.position,
        exerciseId: version.exercise_id,
        exerciseVersionId: version.id,
        prescriptionType: row.prescription_type,
        params,
        textSnapshot,
        note: row.note,
        draftUpdatedAt,
      });
    }
    return skippedCount;
  }

  async listPrograms(
    practitionerId: string,
    input?: { searchQuery?: string },
  ): Promise<ProgramSearchResult> {
    await this.requirePractitioner(practitionerId);
    const records = await this.programs.listForPractitioner({
      practitionerId,
      searchQuery: input?.searchQuery,
    });
    const items: ProgramListItem[] = [];
    for (const record of records) {
      items.push(await this.toListItem(practitionerId, record));
    }
    const trimmed = input?.searchQuery?.trim() ?? "";
    let matchedCode: string | null = null;
    if (trimmed) {
      const keys = programCodeDomain.programCodeSearchKeys(trimmed);
      for (const item of items) {
        if (keys.some((key) => key.toUpperCase() === item.code.toUpperCase())) {
          matchedCode = item.code;
          break;
        }
      }
    }
    return { items, matched_code: matchedCode };
  }

  async listRecentlyDeletedPrograms(
    practitionerId: string,
  ): Promise<ProgramListItem[]> {
    await this.requirePractitioner(practitionerId);
    const records = await this.programs.listForPractitioner({
      practitionerId,
      deletedOnly: true,
    });
    const nowMs = Date.parse(this.now());
    const items: ProgramListItem[] = [];
    for (const record of records) {
      if (!record.deleted_at) {
        continue;
      }
      const deletedMs = Date.parse(record.deleted_at);
      if (Number.isNaN(deletedMs)) {
        continue;
      }
      if (nowMs - deletedMs > PROGRAM_RESTORE_AND_PURGE_WINDOW_MS) {
        continue;
      }
      items.push(await this.toListItem(practitionerId, record));
    }
    return items;
  }

  async updateProgramName(
    practitionerId: string,
    programId: string,
    name: string | null,
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    try {
      await this.programs.updateDraftName(validatedProgramId, name);
    } catch (err) {
      this.mapFreeTextError(err);
    }
    await this.programs.touchDraft(validatedProgramId, this.now());
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  async addExerciseRow(
    practitionerId: string,
    programId: string,
    input: {
      rowId: string;
      exerciseId: string;
      exerciseVersionId?: string;
      prescriptionType?: PrescriptionType;
      params?: ExerciseParams;
      note?: string | null;
    },
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    const rowId = this.parseOpaqueId(input.rowId, "Program row id");
    const exerciseId = this.parseOpaqueId(input.exerciseId, "Exercise id");
    const pinnedVersionId = input.exerciseVersionId
      ? this.parseOpaqueId(input.exerciseVersionId, "Exercise version id")
      : undefined;
    const version = pinnedVersionId
      ? await this.libraryRead.getApprovedVersionById(pinnedVersionId)
      : await this.libraryRead.getLatestApprovedByExerciseId(exerciseId);
    if (!version || version.exercise_id !== exerciseId) {
      throw new ProgramBuilderServiceError("Exercise not found", "exercise_not_found");
    }
    const prescriptionType = this.resolvePrescriptionType(
      version,
      input.prescriptionType,
    );
    const resolved = await this.resolveRowDefaults(
      practitionerId,
      version,
      prescriptionType,
    );
    let params: ExerciseParams;
    if (input.params) {
      try {
        params = validateExerciseParams(input.params);
      } catch (err) {
        this.mapParamError(err);
      }
    } else {
      params = resolved.params;
    }
    const textSnapshot = buildProgramRowTextSnapshot({
      version,
      overrides: resolved.overrides,
      prescriptionType,
    });
    const existingRows = await this.rows.listForProgram(validatedProgramId);
    try {
      await this.rows.replaceRow({
        id: rowId,
        programId: validatedProgramId,
        position: existingRows.length,
        exerciseId: version.exercise_id,
        exerciseVersionId: version.id,
        prescriptionType,
        params,
        textSnapshot,
        note: input.note ?? null,
        draftUpdatedAt: this.now(),
      });
    } catch (err) {
      this.mapRowWriteError(err);
    }
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  async addPlaceholderRow(
    practitionerId: string,
    programId: string,
    input: {
      rowId: string;
      exerciseRequestId: string;
      prescriptionType?: PrescriptionType;
      params?: ExerciseParams;
      note?: string | null;
    },
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    const rowId = this.parseOpaqueId(input.rowId, "Program row id");
    const requestId = this.parseOpaqueId(
      input.exerciseRequestId,
      "Exercise request id",
    );
    const request = await this.exerciseRequests.findById(requestId);
    this.assertExerciseRequestOwnedByPractitioner(practitionerId, request);
    this.assertExerciseRequestOpenForPlaceholder(request);
    const prescriptionType = this.parsePlaceholderPrescriptionType(
      input.prescriptionType,
    );
    let params: ExerciseParams;
    if (input.params) {
      try {
        params = validateExerciseParams(input.params);
      } catch (err) {
        this.mapParamError(err);
      }
    } else {
      params = await this.resolvePlaceholderParams(practitionerId, prescriptionType);
    }
    const textSnapshot = { title: request.requested_name.trim() };
    const existingRows = await this.rows.listForProgram(validatedProgramId);
    try {
      await this.rows.replaceRow({
        id: rowId,
        programId: validatedProgramId,
        position: existingRows.length,
        exerciseRequestId: requestId,
        prescriptionType,
        params,
        textSnapshot,
        note: input.note ?? null,
        draftUpdatedAt: this.now(),
      });
    } catch (err) {
      this.mapRowWriteError(err);
    }
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  async updateRow(
    practitionerId: string,
    programId: string,
    rowId: string,
    input: {
      prescriptionType?: PrescriptionType;
      params?: ExerciseParams;
      note?: string | null;
    },
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    const validatedRowId = this.parseOpaqueId(rowId, "Program row id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    const row = await this.requireOwnedRow(validatedProgramId, validatedRowId);
    let params = parseExerciseParamsJson(row.params_json);
    if (input.params) {
      try {
        params = validateExerciseParams(input.params);
      } catch (err) {
        this.mapParamError(err);
      }
    }
    const textSnapshot = this.parseRowTextSnapshot(row.text_snapshot_json);
    if (row.exercise_request_id) {
      const prescriptionType = input.prescriptionType
        ? this.parsePrescriptionTypeLiteral(input.prescriptionType)
        : row.prescription_type;
      try {
        await this.rows.replaceRow({
          id: row.id,
          programId: validatedProgramId,
          position: row.position,
          exerciseRequestId: row.exercise_request_id,
          prescriptionType,
          params,
          textSnapshot,
          note: input.note !== undefined ? input.note : row.note,
          draftUpdatedAt: this.now(),
        });
      } catch (err) {
        this.mapRowWriteError(err);
      }
      return {
        program: await this.buildProgramView(practitionerId, validatedProgramId),
      };
    }
    const version = await this.libraryRead.getApprovedVersionById(
      row.exercise_version_id!,
    );
    if (!version) {
      throw new ProgramBuilderServiceError("Exercise not found", "exercise_not_found");
    }
    const prescriptionType = input.prescriptionType
      ? this.parsePrescriptionTypeLiteral(input.prescriptionType)
      : row.prescription_type;
    this.assertPrescriptionAllowed(version, prescriptionType);
    try {
      await this.rows.replaceRow({
        id: row.id,
        programId: validatedProgramId,
        position: row.position,
        exerciseId: row.exercise_id,
        exerciseVersionId: row.exercise_version_id,
        prescriptionType,
        params,
        textSnapshot,
        note: input.note !== undefined ? input.note : row.note,
        draftUpdatedAt: this.now(),
      });
    } catch (err) {
      this.mapRowWriteError(err);
    }
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  async duplicateRow(
    practitionerId: string,
    programId: string,
    input: { sourceRowId: string; newRowId: string },
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    const sourceRowId = this.parseOpaqueId(input.sourceRowId, "Program row id");
    const newRowId = this.parseOpaqueId(input.newRowId, "Program row id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    const source = await this.requireOwnedRow(validatedProgramId, sourceRowId);
    const rows = await this.rows.listForProgram(validatedProgramId);
    const params = parseExerciseParamsJson(source.params_json);
    const textSnapshot = this.parseRowTextSnapshot(source.text_snapshot_json);
    try {
      await this.rows.replaceRow({
        id: newRowId,
        programId: validatedProgramId,
        position: rows.length,
        exerciseId: source.exercise_id,
        exerciseVersionId: source.exercise_version_id,
        exerciseRequestId: source.exercise_request_id,
        prescriptionType: source.prescription_type,
        params,
        textSnapshot,
        note: source.note,
        draftUpdatedAt: this.now(),
      });
    } catch (err) {
      this.mapRowWriteError(err);
    }
    const ordered = rows.map((row) => row.id);
    ordered.splice(source.position + 1, 0, newRowId);
    await this.rows.reorderRows(validatedProgramId, ordered, this.now());
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  async removeRow(
    practitionerId: string,
    programId: string,
    rowId: string,
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    const validatedRowId = this.parseOpaqueId(rowId, "Program row id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    try {
      await this.rows.deleteRow(validatedProgramId, validatedRowId, this.now());
    } catch (err) {
      this.mapProgramRepoError(err);
    }
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  async reorderRows(
    practitionerId: string,
    programId: string,
    orderedRowIds: string[],
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    for (const orderedRowId of orderedRowIds) {
      this.parseOpaqueId(orderedRowId, "Program row id");
    }
    try {
      await this.rows.reorderRows(validatedProgramId, orderedRowIds, this.now());
    } catch (err) {
      this.mapProgramRepoError(err);
    }
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  async applyLibraryUpdateToRow(
    practitionerId: string,
    programId: string,
    rowId: string,
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    const validatedRowId = this.parseOpaqueId(rowId, "Program row id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    const row = await this.requireOwnedRow(validatedProgramId, validatedRowId);
    if (!row.exercise_id || !row.exercise_version_id) {
      throw new ProgramBuilderServiceError(
        "Program row not found",
        "program_row_not_found",
      );
    }
    const latest = await this.libraryRead.getLatestApprovedByExerciseId(
      row.exercise_id,
    );
    if (!latest) {
      throw new ProgramBuilderServiceError("Exercise not found", "exercise_not_found");
    }
    const myRow = await this.practitionerExercises.find(
      practitionerId,
      row.exercise_id,
    );
    const overrides = myRow
      ? myRow.textOverrides
      : parsePractitionerTextOverrides("{}");
    const textSnapshot = buildProgramRowTextSnapshot({
      version: latest,
      overrides,
      prescriptionType: row.prescription_type,
    });
    const params = parseExerciseParamsJson(row.params_json);
    try {
      await this.rows.replaceRow({
        id: row.id,
        programId: validatedProgramId,
        position: row.position,
        exerciseId: row.exercise_id,
        exerciseVersionId: latest.id,
        prescriptionType: row.prescription_type,
        params,
        textSnapshot,
        note: row.note,
        draftUpdatedAt: this.now(),
      });
    } catch (err) {
      this.mapRowWriteError(err);
    }
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  async keepLibraryUpdateForRow(
    practitionerId: string,
    programId: string,
    rowId: string,
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    const validatedRowId = this.parseOpaqueId(rowId, "Program row id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    const row = await this.requireOwnedRow(validatedProgramId, validatedRowId);
    if (!row.exercise_id) {
      throw new ProgramBuilderServiceError(
        "Program row not found",
        "program_row_not_found",
      );
    }
    const pinned = await this.libraryRead.getApprovedVersionById(
      row.exercise_version_id!,
    );
    const latest = await this.libraryRead.getLatestApprovedByExerciseId(
      row.exercise_id,
    );
    if (!pinned || !latest) {
      throw new ProgramBuilderServiceError("Exercise not found", "exercise_not_found");
    }
    if (latest.version_number <= pinned.version_number) {
      throw new ProgramBuilderServiceError(
        "No library update is available for this row",
        "invalid_input",
      );
    }
    const textSnapshot = this.parseRowTextSnapshot(row.text_snapshot_json);
    textSnapshot.libraryUpdateDismissedVersionNumber = latest.version_number;
    try {
      await this.rows.replaceRow({
        id: row.id,
        programId: validatedProgramId,
        position: row.position,
        exerciseId: row.exercise_id,
        exerciseVersionId: row.exercise_version_id,
        prescriptionType: row.prescription_type,
        params: parseExerciseParamsJson(row.params_json),
        textSnapshot,
        note: row.note,
        draftUpdatedAt: this.now(),
      });
    } catch (err) {
      this.mapRowWriteError(err);
    }
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  async deleteProgram(
    practitionerId: string,
    programId: string,
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId);
    await this.programs.softDelete(validatedProgramId, this.now());
    return {
      program: await this.buildProgramView(
        practitionerId,
        validatedProgramId,
        undefined,
        {
          allowDeleted: true,
        },
      ),
    };
  }

  async restoreProgram(
    practitionerId: string,
    programId: string,
  ): Promise<ProgramMutationResult> {
    const validatedProgramId = this.parseOpaqueId(programId, "Program id");
    await this.requireOwnedProgram(practitionerId, validatedProgramId, {
      allowDeleted: true,
    });
    try {
      await this.programs.restore(validatedProgramId, new Date(this.now()));
    } catch (err) {
      if (
        err instanceof ProgramRepositoryError &&
        err.message === "Restore window has expired"
      ) {
        throw new ProgramBuilderServiceError(
          "Restore window has expired",
          "restore_window_expired",
        );
      }
      this.mapProgramRepoError(err);
    }
    return { program: await this.buildProgramView(practitionerId, validatedProgramId) };
  }

  private async buildProgramView(
    practitionerId: string,
    programId: string,
    programRecord?: ProgramRecord,
    options?: { allowDeleted?: boolean },
  ): Promise<ProgramBuilderView> {
    const program =
      programRecord ??
      (await this.requireOwnedProgram(practitionerId, programId, options));
    const rows = program.deleted_at ? [] : await this.rows.listForProgram(programId);
    const builderRows: ProgramBuilderRow[] = [];
    let libraryUpdates = 0;
    for (const row of rows) {
      const built = await this.toBuilderRow(practitionerId, row);
      builderRows.push(built);
      if (built.library_update) {
        libraryUpdates += 1;
      }
    }
    const openLink = program.deleted_at
      ? null
      : await this.links.findOpenByProgramId(programId);
    return {
      program_id: program.id,
      code: program.code,
      name: program.name,
      created_at: program.created_at,
      draft_updated_at: program.draft_updated_at,
      auto_save_status: computeAutoSaveStatus(program),
      draft_saved_at: program.draft_updated_at,
      exercise_count: builderRows.length,
      library_updates_to_review: libraryUpdates,
      rows: builderRows,
      open_share_link: openLink !== null,
      deleted_at: program.deleted_at,
    };
  }

  private async toListItem(
    practitionerId: string,
    record: ProgramRecord,
  ): Promise<ProgramListItem> {
    const view = await this.buildProgramView(practitionerId, record.id, record);
    return {
      program_id: view.program_id,
      code: view.code,
      name: view.name,
      exercise_count: view.exercise_count,
      draft_updated_at: view.draft_updated_at,
      auto_save_status: view.auto_save_status,
      library_updates_to_review: view.library_updates_to_review,
      deleted_at: view.deleted_at,
    };
  }

  private async toBuilderRow(
    practitionerId: string,
    row: ProgramRow,
  ): Promise<ProgramBuilderRow> {
    const textSnapshot = this.parseRowTextSnapshot(row.text_snapshot_json);
    const params = parseExerciseParamsJson(row.params_json);
    if (row.exercise_request_id) {
      return {
        id: row.id,
        position: row.position,
        kind: "placeholder",
        exercise_id: null,
        exercise_version_id: null,
        exercise_request_id: row.exercise_request_id,
        pinned_version_number: null,
        prescription_type: row.prescription_type,
        params,
        params_source: null,
        text_snapshot: textSnapshot,
        note: row.note,
        library_update: null,
      };
    }
    const pinned = await this.libraryRead.getApprovedVersionById(
      row.exercise_version_id!,
    );
    const latest =
      row.exercise_id !== null
        ? await this.libraryRead.getLatestApprovedByExerciseId(row.exercise_id)
        : null;
    const libraryUpdate = detectLibraryUpdate(row, pinned, latest, textSnapshot);
    let paramsSource:
      import("../../domain/resolve-exercise-params.js").ResolvedParamsSource | null =
      null;
    if (pinned) {
      const resolved = await this.resolveRowDefaults(
        practitionerId,
        pinned,
        row.prescription_type,
      );
      paramsSource = resolved.source;
    }
    return {
      id: row.id,
      position: row.position,
      kind: "exercise",
      exercise_id: row.exercise_id,
      exercise_version_id: row.exercise_version_id,
      exercise_request_id: null,
      pinned_version_number: pinned?.version_number ?? null,
      prescription_type: row.prescription_type,
      params,
      params_source: paramsSource,
      text_snapshot: textSnapshot,
      note: row.note,
      library_update: libraryUpdate,
    };
  }

  private async resolveRowDefaults(
    practitionerId: string,
    version: LatestApprovedVersionRow,
    prescriptionType: PrescriptionType,
  ): Promise<{
    params: ExerciseParams;
    source: import("../../domain/resolve-exercise-params.js").ResolvedParamsSource;
    overrides: import("../../domain/exercise-text-overrides.js").TextOverrides;
  }> {
    const globalDefaults = await this.typeDefaults.listGlobalDefaults();
    const practitionerDefaults = await this.typeDefaults.getPractitionerDefaults(
      practitionerId,
      prescriptionType,
    );
    const myRow = await this.practitionerExercises.find(
      practitionerId,
      version.exercise_id,
    );
    const paramOverrides = myRow?.paramOverrides ?? {};
    const resolved = resolveParamsForProgramRow({
      prescriptionType,
      version,
      paramOverrides,
      practitionerTypeDefaults: practitionerDefaults,
      globalTypeDefaults: globalDefaults[prescriptionType],
    });
    const overrides = myRow?.textOverrides ?? {};
    return { params: resolved.params, source: resolved.source, overrides };
  }

  private async resolvePlaceholderParams(
    practitionerId: string,
    prescriptionType: PrescriptionType,
  ): Promise<ExerciseParams> {
    const globalDefaults = await this.typeDefaults.listGlobalDefaults();
    const practitionerDefaults = await this.typeDefaults.getPractitionerDefaults(
      practitionerId,
      prescriptionType,
    );
    return resolveExerciseParams({
      prescriptionType,
      paramOverrides: {},
      practitionerTypeDefaults: practitionerDefaults,
      globalTypeDefaults: globalDefaults[prescriptionType],
    }).params;
  }

  private parsePlaceholderPrescriptionType(
    value: PrescriptionType | undefined,
  ): PrescriptionType {
    if (value === undefined) {
      throw new ProgramBuilderServiceError(
        "prescriptionType is required for placeholder rows",
        "invalid_input",
      );
    }
    return this.parsePrescriptionTypeLiteral(value);
  }

  private parsePrescriptionTypeLiteral(value: string): PrescriptionType {
    if (!PRESCRIPTION_TYPES.includes(value as PrescriptionType)) {
      throw new ProgramBuilderServiceError(
        `prescriptionType must be one of: ${PRESCRIPTION_TYPES.join(", ")}`,
        "invalid_input",
      );
    }
    return value as PrescriptionType;
  }

  private resolvePrescriptionType(
    version: LatestApprovedVersionRow,
    requested?: PrescriptionType,
  ): PrescriptionType {
    const allowed = prescriptionTypesForCategory(version.category);
    if (requested) {
      const prescriptionType = this.parsePrescriptionTypeLiteral(requested);
      this.assertPrescriptionAllowed(version, prescriptionType);
      return prescriptionType;
    }
    if (allowed.length !== 1) {
      throw new ProgramBuilderServiceError(
        "prescriptionType is required for this exercise category",
        "invalid_input",
      );
    }
    return allowed[0]!;
  }

  private prescriptionTypeAllowed(
    version: LatestApprovedVersionRow,
    prescriptionType: PrescriptionType,
  ): boolean {
    return prescriptionTypesForCategory(version.category).includes(prescriptionType);
  }

  private assertPrescriptionAllowed(
    version: LatestApprovedVersionRow,
    prescriptionType: PrescriptionType,
  ): void {
    if (!this.prescriptionTypeAllowed(version, prescriptionType)) {
      throw new ProgramBuilderServiceError(
        "prescriptionType is not allowed for this exercise category",
        "invalid_input",
      );
    }
  }

  private assertExerciseRequestOpenForPlaceholder(request: {
    status: import("../../domain/exercise-types.js").ExerciseRequestStatus;
  }): void {
    if (request.status === "open" || request.status === "drafting") {
      return;
    }
    throw new ProgramBuilderServiceError(
      "Only an in-progress exercise request can be attached to a placeholder row",
      "invalid_input",
    );
  }

  private assertExerciseRequestOwnedByPractitioner(
    practitionerId: string,
    request: {
      requested_by: string;
    } | null,
  ): asserts request is { requested_by: string } {
    if (!request) {
      throw new ProgramBuilderServiceError(
        "Exercise request not found",
        "exercise_request_not_found",
      );
    }
    if (request.requested_by !== practitionerId) {
      throw new ProgramBuilderServiceError(
        "Exercise request not found",
        "exercise_request_not_found",
      );
    }
  }

  private parseRowTextSnapshot(
    raw: string,
  ): import("../../domain/program-types.js").ProgramRowTextSnapshot {
    try {
      return parseProgramRowTextSnapshotJson(raw);
    } catch (err) {
      if (err instanceof Error) {
        throw new ProgramBuilderServiceError(err.message, "invalid_input");
      }
      throw err;
    }
  }

  private parseOpaqueId(value: string, fieldLabel: string): string {
    try {
      return validateOpaqueEntityId(value, fieldLabel);
    } catch (err) {
      this.mapOpaqueEntityIdError(err);
    }
    throw new ProgramBuilderServiceError("Invalid opaque id", "invalid_input");
  }

  private mapOpaqueEntityIdError(err: unknown): never {
    if (err instanceof OpaqueEntityIdValidationError) {
      throw new ProgramBuilderServiceError(err.message, "invalid_input");
    }
    throw err;
  }

  private mapRowWriteError(err: unknown): never {
    if (err instanceof FreeTextValidationError) {
      this.mapFreeTextError(err);
    }
    if (err instanceof ParamValidationError) {
      this.mapParamError(err);
    }
    if (err instanceof ProgramRepositoryError) {
      if (err.message.includes("text_snapshot_json")) {
        throw new ProgramBuilderServiceError(err.message, "invalid_input");
      }
    }
    if (err instanceof Error) {
      if (err.message.includes("UNIQUE constraint failed: program_rows.id")) {
        throw new ProgramBuilderServiceError(
          "Program row id is already in use",
          "invalid_input",
        );
      }
      if (err.message.includes("libraryUpdateDismissedVersionNumber")) {
        throw new ProgramBuilderServiceError(err.message, "invalid_input");
      }
      if (
        err.message.includes("CHECK constraint failed: program_rows.prescription_type")
      ) {
        throw new ProgramBuilderServiceError(
          `prescriptionType must be one of: ${PRESCRIPTION_TYPES.join(", ")}`,
          "invalid_input",
        );
      }
    }
    this.mapProgramRepoError(err);
  }

  private async requirePractitioner(practitionerId: string): Promise<void> {
    this.parseOpaqueId(practitionerId, "Practitioner id");
    const row = await this.practitioners.findById(practitionerId);
    if (!row) {
      throw new ProgramBuilderServiceError(
        "Practitioner not found",
        "practitioner_not_found",
      );
    }
  }

  private async requireOwnedProgram(
    practitionerId: string,
    programId: string,
    options?: { allowDeleted?: boolean },
  ): Promise<ProgramRecord> {
    await this.requirePractitioner(practitionerId);
    const program = await this.programs.findById(programId);
    if (!program) {
      throw new ProgramBuilderServiceError("Program not found", "program_not_found");
    }
    if (program.created_by !== practitionerId) {
      throw new ProgramBuilderServiceError("Program not found", "forbidden");
    }
    if (program.deleted_at && !options?.allowDeleted) {
      throw new ProgramBuilderServiceError("Program not found", "program_not_found");
    }
    return program;
  }

  private async requireOwnedRow(programId: string, rowId: string): Promise<ProgramRow> {
    const row = await this.rows.findById(rowId);
    if (!row || row.program_id !== programId) {
      throw new ProgramBuilderServiceError(
        "Program row not found",
        "program_row_not_found",
      );
    }
    return row;
  }

  private mapProgramRepoError(err: unknown): never {
    if (err instanceof ProgramRepositoryError) {
      if (err.message === "Program row not found") {
        throw new ProgramBuilderServiceError(
          "Program row not found",
          "program_row_not_found",
        );
      }
      if (err.message === "Program not found") {
        throw new ProgramBuilderServiceError("Program not found", "program_not_found");
      }
      throw new ProgramBuilderServiceError(err.message, "invalid_input");
    }
    throw err;
  }

  private mapFreeTextError(err: unknown): never {
    if (err instanceof FreeTextValidationError) {
      throw new ProgramBuilderServiceError(err.message, "invalid_input");
    }
    throw err;
  }

  private mapParamError(err: unknown): never {
    if (err instanceof ParamValidationError) {
      throw new ProgramBuilderServiceError(err.message, "invalid_input");
    }
    throw err;
  }
}

export function computeAutoSaveStatus(program: ProgramRecord): ProgramAutoSaveStatus {
  if (!program.published_at) {
    return { kind: "not_published_yet" };
  }
  const draftMs = Date.parse(program.draft_updated_at);
  const publishedMs = Date.parse(program.published_at);
  if (!Number.isNaN(draftMs) && !Number.isNaN(publishedMs) && draftMs > publishedMs) {
    return { kind: "unpublished_changes" };
  }
  return { kind: "published", published_at: program.published_at };
}

export function detectLibraryUpdate(
  row: ProgramRow,
  pinned: LatestApprovedVersionRow | null,
  latest: LatestApprovedVersionRow | null,
  textSnapshot: import("../../domain/program-types.js").ProgramRowTextSnapshot,
): ProgramLibraryUpdatePrompt | null {
  if (!row.exercise_id || !pinned || !latest) {
    return null;
  }
  if (latest.version_number <= pinned.version_number) {
    return null;
  }
  const dismissed = textSnapshot.libraryUpdateDismissedVersionNumber ?? 0;
  if (latest.version_number <= dismissed) {
    return null;
  }
  return {
    row_id: row.id,
    exercise_id: row.exercise_id,
    exercise_title: textSnapshot.title,
    pinned_version_number: pinned.version_number,
    latest_version_number: latest.version_number,
  };
}

/**
 * Links placeholder program rows when an exercise request is approved.
 *
 * Uses the caller's `sql` port (including an in-flight transaction on that port) only;
 * does not begin, commit, or roll back a transaction. DIDI-1004 `approveRequest` must
 * call this inside the same transaction as approval.
 */
export async function linkApprovedPlaceholders(
  sql: SqlStoragePort,
  exerciseRequestId: string,
  approvedVersionId: string,
  now: () => string = () => new Date().toISOString(),
): Promise<number> {
  return new ProgramBuilderService(sql, now).linkApprovedPlaceholders(
    exerciseRequestId,
    approvedVersionId,
  );
}
