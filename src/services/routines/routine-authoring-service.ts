import { FreeTextValidationError } from "../../domain/exercise-free-text.js";
import { parseExerciseParamsJson } from "../../domain/exercise-params.js";
import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { ExerciseLibraryReadRepository } from "../../storage/repositories/exercise-library-read.js";
import { PractitionersRepository } from "../../storage/repositories/exercise-data.js";
import {
  type RoutineRecord,
  RoutineRepositoryError,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
} from "../../storage/repositories/routines.js";
import {
  PractitionerNotFoundError,
  requirePractitionerRecord,
} from "../practitioner-access.js";
import { findUnapprovedRoutineRow } from "./validate-approved-rows.js";
import type {
  PublishValidationIssue,
  RoutineDraftDiscardUndo,
  RoutineDraftUndoSnapshot,
  RoutineVersionHistoryItem,
  RoutineVersionHistoryResult,
} from "./types.js";

export class RoutineAuthoringServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "practitioner_not_found"
      | "routine_not_found"
      | "invalid_input"
      | "publish_validation_failed"
      | "routine_not_published"
      | "draft_not_touchable"
      | "undo_mismatch"
      | "stale_write"
      | "exercise_not_found",
    readonly validation_issues?: PublishValidationIssue[],
  ) {
    super(message);
    this.name = "RoutineAuthoringServiceError";
  }
}

type AuthoringRowInput = {
  position: number;
  exerciseId: string;
  exerciseVersionId: string;
  prescriptionType: PrescriptionType;
  params: ExerciseParams;
};

function mapRepoError(err: unknown): never {
  if (err instanceof RoutineRepositoryError) {
    if (err.code === "stale_write") {
      throw new RoutineAuthoringServiceError("Stale write", "stale_write");
    }
    if (err.message === "Routine not found") {
      throw new RoutineAuthoringServiceError(err.message, "routine_not_found");
    }
    if (err.message.includes("not published")) {
      throw new RoutineAuthoringServiceError(err.message, "routine_not_published");
    }
    if (err.message.includes("Only the author")) {
      throw new RoutineAuthoringServiceError("Routine not found", "routine_not_found");
    }
    throw new RoutineAuthoringServiceError(err.message, "invalid_input");
  }
  if (err instanceof FreeTextValidationError) {
    throw new RoutineAuthoringServiceError(err.message, "invalid_input");
  }
  throw err;
}

export function parseRoutineDraftDiscardUndo(value: unknown): RoutineDraftDiscardUndo {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new RoutineAuthoringServiceError("Invalid undo payload", "invalid_input");
  }
  const record = value as Record<string, unknown>;
  if (
    typeof record.practitioner_id !== "string" ||
    typeof record.routine_id !== "string"
  ) {
    throw new RoutineAuthoringServiceError("Invalid undo payload", "invalid_input");
  }
  const snap = record.snapshot;
  if (!snap || typeof snap !== "object" || Array.isArray(snap)) {
    throw new RoutineAuthoringServiceError("Undo snapshot required", "invalid_input");
  }
  const snapshot = snap as Record<string, unknown>;
  if (
    typeof snapshot.routine_id !== "string" ||
    typeof snapshot.draft_version_id !== "string" ||
    typeof snapshot.created_at !== "string" ||
    typeof snapshot.draft_updated_at !== "string" ||
    typeof snapshot.body_region_id !== "string" ||
    !Array.isArray(snapshot.rows)
  ) {
    throw new RoutineAuthoringServiceError(
      "Invalid draft undo snapshot",
      "invalid_input",
    );
  }
  return {
    practitioner_id: record.practitioner_id,
    routine_id: record.routine_id,
    snapshot: {
      routine_id: snapshot.routine_id,
      draft_version_id: snapshot.draft_version_id,
      created_at: snapshot.created_at,
      draft_updated_at: snapshot.draft_updated_at,
      body_region_id: snapshot.body_region_id,
      condition_id:
        snapshot.condition_id === null || typeof snapshot.condition_id === "string"
          ? (snapshot.condition_id as string | null)
          : (() => {
              throw new RoutineAuthoringServiceError(
                "Invalid condition_id in undo",
                "invalid_input",
              );
            })(),
      who_its_for:
        snapshot.who_its_for === null || typeof snapshot.who_its_for === "string"
          ? (snapshot.who_its_for as string | null)
          : (() => {
              throw new RoutineAuthoringServiceError(
                "Invalid who_its_for in undo",
                "invalid_input",
              );
            })(),
      name:
        snapshot.name === null || typeof snapshot.name === "string"
          ? (snapshot.name as string | null)
          : (() => {
              throw new RoutineAuthoringServiceError(
                "Invalid name in undo",
                "invalid_input",
              );
            })(),
      rows: snapshot.rows.map((row) => {
        if (!row || typeof row !== "object" || Array.isArray(row)) {
          throw new RoutineAuthoringServiceError(
            "Invalid row in undo",
            "invalid_input",
          );
        }
        const r = row as Record<string, unknown>;
        if (
          typeof r.position !== "number" ||
          typeof r.exercise_id !== "string" ||
          typeof r.exercise_version_id !== "string" ||
          typeof r.prescription_type !== "string" ||
          typeof r.params_json !== "string"
        ) {
          throw new RoutineAuthoringServiceError(
            "Invalid row in undo",
            "invalid_input",
          );
        }
        return {
          position: r.position,
          exercise_id: r.exercise_id,
          exercise_version_id: r.exercise_version_id,
          prescription_type: r.prescription_type as PrescriptionType,
          params_json: r.params_json,
        };
      }),
    },
  };
}

export class RoutineAuthoringService {
  private readonly routines: RoutinesRepository;
  private readonly versions: RoutineVersionsRepository;
  private readonly versionRows: RoutineVersionRowsRepository;
  private readonly exerciseRead: ExerciseLibraryReadRepository;
  private readonly practitioners: PractitionersRepository;

  constructor(private readonly sql: SqlStoragePort) {
    this.routines = new RoutinesRepository(sql);
    this.versions = new RoutineVersionsRepository(sql);
    this.versionRows = new RoutineVersionRowsRepository(sql);
    this.exerciseRead = new ExerciseLibraryReadRepository(sql);
    this.practitioners = new PractitionersRepository(sql);
  }

  private now(): string {
    return new Date().toISOString();
  }

  private async requirePractitioner(practitionerId: string): Promise<void> {
    try {
      await requirePractitionerRecord(this.practitioners, practitionerId);
    } catch (err) {
      if (err instanceof PractitionerNotFoundError) {
        throw new RoutineAuthoringServiceError(
          "Practitioner not found",
          "practitioner_not_found",
        );
      }
      throw err;
    }
  }

  private snapshotRowsToAuthoringInput(
    rows: RoutineDraftUndoSnapshot["rows"],
  ): AuthoringRowInput[] {
    return rows.map((row) => ({
      position: row.position,
      exerciseId: row.exercise_id,
      exerciseVersionId: row.exercise_version_id,
      prescriptionType: row.prescription_type as PrescriptionType,
      params: parseExerciseParamsJson(row.params_json),
    }));
  }

  private versionRowsToAuthoringInput(
    rows: Awaited<ReturnType<RoutineVersionRowsRepository["listForVersion"]>>,
  ): AuthoringRowInput[] {
    return rows.map((row) => ({
      position: row.position,
      exerciseId: row.exercise_id,
      exerciseVersionId: row.exercise_version_id,
      prescriptionType: row.prescription_type,
      params: parseExerciseParamsJson(row.params_json),
    }));
  }

  private async validateApprovedRows(rows: AuthoringRowInput[]): Promise<void> {
    const unapproved = await findUnapprovedRoutineRow(
      this.exerciseRead,
      rows.map((row) => ({
        exerciseId: row.exerciseId,
        exerciseVersionId: row.exerciseVersionId,
      })),
    );
    if (unapproved) {
      throw new RoutineAuthoringServiceError(
        "Exercise not found",
        "exercise_not_found",
      );
    }
  }

  private publishValidationIssues(
    name: string | null | undefined,
    rowCount: number,
  ): PublishValidationIssue[] {
    const issues: PublishValidationIssue[] = [];
    if (!name?.trim()) {
      issues.push("missing_name");
    }
    if (rowCount === 0) {
      issues.push("missing_exercises");
    }
    return issues;
  }

  private async requireAuthorVisibleDraft(
    practitionerId: string,
    routineId: string,
  ): Promise<RoutineRecord> {
    const routine = await this.routines.findVisibleToPractitioner(
      routineId,
      practitionerId,
    );
    if (!routine) {
      throw new RoutineAuthoringServiceError("Routine not found", "routine_not_found");
    }
    if (routine.published_version !== null) {
      throw new RoutineAuthoringServiceError(
        "Routine is not a draft",
        "routine_not_published",
      );
    }
    return routine;
  }

  async isDraftUntouched(routineId: string): Promise<boolean> {
    const routine = await this.routines.findById(routineId);
    if (!routine || routine.published_version !== null) {
      return false;
    }
    const draft = await this.versions.findDraftForRoutine(routineId);
    if (!draft) {
      return false;
    }
    const rows = await this.versionRows.listForVersion(draft.id);
    const noName = draft.name === null || draft.name.trim() === "";
    const noRows = rows.length === 0;
    const noWho = routine.who_its_for === null;
    const noCondition = routine.condition_id === null;
    return noName && noRows && noWho && noCondition;
  }

  async createDraft(input: {
    practitionerId: string;
    bodyRegionId: string;
    conditionId?: string | null;
    whoItsFor?: string | null;
    name?: string | null;
  }): Promise<{
    routine_id: string;
    draft_version_id: string;
    draft_updated_at: string;
  }> {
    await this.requirePractitioner(input.practitionerId);
    const routineId = crypto.randomUUID();
    const draftVersionId = crypto.randomUUID();
    const createdAt = this.now();
    try {
      await this.routines.createDraft({
        id: routineId,
        draftVersionId,
        createdBy: input.practitionerId,
        createdAt,
        bodyRegionId: input.bodyRegionId,
        conditionId: input.conditionId,
        whoItsFor: input.whoItsFor,
        name: input.name,
      });
    } catch (err) {
      mapRepoError(err);
    }
    return {
      routine_id: routineId,
      draft_version_id: draftVersionId,
      draft_updated_at: createdAt,
    };
  }

  async autosaveDraft(input: {
    practitionerId: string;
    routineId: string;
    bodyRegionId?: string;
    conditionId?: string | null;
    whoItsFor?: string | null;
    name?: string | null;
    rows?: AuthoringRowInput[];
  }): Promise<{ routine_id: string; draft_updated_at: string }> {
    await this.requirePractitioner(input.practitionerId);
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    await this.requireAuthorVisibleDraft(input.practitionerId, routineId);
    const draftUpdatedAt = this.now();
    try {
      await this.routines.updateDraftMetadata({
        routineId,
        authorId: input.practitionerId,
        draftUpdatedAt,
        conditionId: input.conditionId,
        bodyRegionId: input.bodyRegionId,
        whoItsFor: input.whoItsFor,
        name: input.name,
      });
      if (input.rows) {
        await this.validateApprovedRows(input.rows);
        await this.versionRows.replaceAllDraftRows({
          routineId,
          authorId: input.practitionerId,
          draftUpdatedAt,
          rows: input.rows.map((row) => ({
            id: crypto.randomUUID(),
            position: row.position,
            exerciseId: row.exerciseId,
            exerciseVersionId: row.exerciseVersionId,
            prescriptionType: row.prescriptionType,
            params: row.params,
          })),
        });
      }
    } catch (err) {
      mapRepoError(err);
    }
    return { routine_id: routineId, draft_updated_at: draftUpdatedAt };
  }

  async cancelUntouchedDraft(
    practitionerId: string,
    routineId: string,
  ): Promise<{ ok: true }> {
    await this.requirePractitioner(practitionerId);
    const validated = validateOpaqueEntityId(routineId, "Routine id");
    await this.requireAuthorVisibleDraft(practitionerId, validated);
    if (!(await this.isDraftUntouched(validated))) {
      throw new RoutineAuthoringServiceError(
        "Draft is not untouched",
        "draft_not_touchable",
      );
    }
    try {
      await this.routines.deleteDraft(validated, practitionerId);
    } catch (err) {
      mapRepoError(err);
    }
    return { ok: true };
  }

  private async captureDraftDiscardUndo(
    practitionerId: string,
    routineId: string,
  ): Promise<RoutineDraftDiscardUndo> {
    const routine = await this.routines.findById(routineId);
    if (!routine) {
      throw new RoutineAuthoringServiceError("Routine not found", "routine_not_found");
    }
    const draft = await this.versions.findDraftForRoutine(routineId);
    if (!draft) {
      throw new RoutineAuthoringServiceError(
        "Draft version not found",
        "invalid_input",
      );
    }
    const rows = await this.versionRows.listForVersion(draft.id);
    const snapshot: RoutineDraftUndoSnapshot = {
      routine_id: routineId,
      draft_version_id: draft.id,
      created_at: routine.created_at,
      draft_updated_at: routine.draft_updated_at,
      body_region_id: routine.body_region_id,
      condition_id: routine.condition_id,
      who_its_for: routine.who_its_for,
      name: draft.name,
      rows: rows.map((row) => ({
        position: row.position,
        exercise_id: row.exercise_id,
        exercise_version_id: row.exercise_version_id,
        prescription_type: row.prescription_type,
        params_json: row.params_json,
      })),
    };
    return { practitioner_id: practitionerId, routine_id: routineId, snapshot };
  }

  async discardDraft(
    practitionerId: string,
    routineId: string,
  ): Promise<{ undo: RoutineDraftDiscardUndo }> {
    await this.requirePractitioner(practitionerId);
    const validated = validateOpaqueEntityId(routineId, "Routine id");
    await this.requireAuthorVisibleDraft(practitionerId, validated);
    const undo = await this.captureDraftDiscardUndo(practitionerId, validated);
    try {
      await this.routines.deleteDraft(validated, practitionerId);
      await this.routines.recordDraftDiscard({
        routineId: validated,
        practitionerId,
        draftVersionId: undo.snapshot.draft_version_id,
        discardedAt: this.now(),
      });
    } catch (err) {
      mapRepoError(err);
    }
    return { undo };
  }

  async undoDiscardDraft(
    urlPractitionerId: string,
    urlRoutineId: string,
    payload: unknown,
  ): Promise<void> {
    await this.requirePractitioner(urlPractitionerId);
    const validatedRoutineId = validateOpaqueEntityId(urlRoutineId, "Routine id");
    const existing = await this.routines.findById(validatedRoutineId);
    if (existing) {
      const visible = await this.routines.findVisibleToPractitioner(
        validatedRoutineId,
        urlPractitionerId,
      );
      if (!visible) {
        throw new RoutineAuthoringServiceError(
          "Routine not found",
          "routine_not_found",
        );
      }
      throw new RoutineAuthoringServiceError("Routine already exists", "invalid_input");
    }
    const parsed = parseRoutineDraftDiscardUndo(payload);
    if (
      parsed.practitioner_id !== urlPractitionerId ||
      parsed.routine_id !== urlRoutineId
    ) {
      throw new RoutineAuthoringServiceError(
        "Undo snapshot does not match URL",
        "undo_mismatch",
      );
    }
    const snap = parsed.snapshot;
    const hasDiscardRecord = await this.routines.hasDraftDiscardForUndo({
      routineId: validatedRoutineId,
      practitionerId: urlPractitionerId,
      draftVersionId: snap.draft_version_id,
    });
    if (!hasDiscardRecord) {
      throw new RoutineAuthoringServiceError("Routine not found", "routine_not_found");
    }
    await this.validateApprovedRows(this.snapshotRowsToAuthoringInput(snap.rows));
    try {
      await this.routines.recreateDraftFromSnapshot({
        id: snap.routine_id,
        draftVersionId: snap.draft_version_id,
        createdBy: urlPractitionerId,
        createdAt: snap.created_at,
        draftUpdatedAt: snap.draft_updated_at,
        bodyRegionId: snap.body_region_id,
        conditionId: snap.condition_id,
        whoItsFor: snap.who_its_for,
        name: snap.name,
        rows: snap.rows.map((row) => ({
          id: crypto.randomUUID(),
          position: row.position,
          exerciseId: row.exercise_id,
          exerciseVersionId: row.exercise_version_id,
          prescriptionType: row.prescription_type,
          params: parseExerciseParamsJson(row.params_json),
        })),
      });
      await this.routines.removeDraftDiscard({
        routineId: validatedRoutineId,
        practitionerId: urlPractitionerId,
        draftVersionId: snap.draft_version_id,
      });
    } catch (err) {
      mapRepoError(err);
    }
  }

  async publishDraft(input: {
    practitionerId: string;
    routineId: string;
    name?: string;
  }): Promise<{
    routine_id: string;
    version_number: number;
    routine_version_id: string;
  }> {
    await this.requirePractitioner(input.practitionerId);
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    await this.requireAuthorVisibleDraft(input.practitionerId, routineId);
    const draft = await this.versions.findDraftForRoutine(routineId);
    if (!draft) {
      throw new RoutineAuthoringServiceError("Routine not found", "routine_not_found");
    }
    const name = input.name ?? draft.name ?? null;
    const rows = await this.versionRows.listForVersion(draft.id);
    const issues = this.publishValidationIssues(name, rows.length);
    if (issues.length > 0) {
      throw new RoutineAuthoringServiceError(
        "Publish validation failed",
        "publish_validation_failed",
        issues,
      );
    }
    await this.validateApprovedRows(this.versionRowsToAuthoringInput(rows));
    try {
      const published = await this.versions.publishDraft({
        routineId,
        authorId: input.practitionerId,
        publishedAt: this.now(),
        name: name!.trim(),
      });
      return {
        routine_id: routineId,
        version_number: published.version_number,
        routine_version_id: published.id,
      };
    } catch (err) {
      if (err instanceof RoutineRepositoryError) {
        const issuesFromRepo = this.publishValidationIssues(name, rows.length);
        if (issuesFromRepo.length > 0) {
          throw new RoutineAuthoringServiceError(
            "Publish validation failed",
            "publish_validation_failed",
            issuesFromRepo,
          );
        }
      }
      mapRepoError(err);
    }
  }

  async saveCommunityVersion(input: {
    practitionerId: string;
    routineId: string;
    expectedPublishedVersion: number;
    name: string;
    changeSummary?: string | null;
    rows: AuthoringRowInput[];
    conditionId?: string | null;
    bodyRegionId?: string;
    whoItsFor?: string | null;
  }): Promise<{
    routine_id: string;
    version_number: number;
    routine_version_id: string;
  }> {
    await this.requirePractitioner(input.practitionerId);
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const routine = await this.routines.findById(routineId);
    if (!routine || routine.published_version === null) {
      throw new RoutineAuthoringServiceError(
        "Routine is not published",
        "routine_not_published",
      );
    }
    if (routine.published_version !== input.expectedPublishedVersion) {
      throw new RoutineAuthoringServiceError("Stale write", "stale_write");
    }
    if (input.rows.length === 0) {
      throw new RoutineAuthoringServiceError(
        "Cannot save an empty routine version",
        "invalid_input",
      );
    }
    await this.validateApprovedRows(input.rows);
    const live = await this.versions.findPublishedVersion(
      routineId,
      input.expectedPublishedVersion,
    );
    if (!live) {
      throw new RoutineAuthoringServiceError("Routine not found", "routine_not_found");
    }
    try {
      const saved = await this.versions.savePublishedVersion({
        id: crypto.randomUUID(),
        routineId,
        createdBy: input.practitionerId,
        createdAt: this.now(),
        name: input.name,
        changeSummary: input.changeSummary,
        copyFromVersionId: live.id,
        rows: input.rows.map((row) => ({
          id: crypto.randomUUID(),
          position: row.position,
          exerciseId: row.exerciseId,
          exerciseVersionId: row.exerciseVersionId,
          prescriptionType: row.prescriptionType,
          params: row.params,
        })),
        conditionId: input.conditionId,
        bodyRegionId: input.bodyRegionId,
        whoItsFor: input.whoItsFor,
      });
      return {
        routine_id: routineId,
        version_number: saved.version_number,
        routine_version_id: saved.id,
      };
    } catch (err) {
      mapRepoError(err);
    }
  }

  async restoreVersion(input: {
    practitionerId: string;
    routineId: string;
    restoreFromVersionNumber: number;
  }): Promise<{
    routine_id: string;
    restored_from_version_number: number;
    version_number: number;
    routine_version_id: string;
  }> {
    await this.requirePractitioner(input.practitionerId);
    const routineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const routine = await this.routines.findById(routineId);
    if (!routine || routine.published_version === null) {
      throw new RoutineAuthoringServiceError(
        "Routine is not published",
        "routine_not_published",
      );
    }
    const source = await this.versions.findPublishedVersion(
      routineId,
      input.restoreFromVersionNumber,
    );
    if (!source) {
      throw new RoutineAuthoringServiceError("Routine not found", "routine_not_found");
    }
    const rows = await this.versionRows.listForVersion(source.id);
    if (rows.length === 0) {
      throw new RoutineAuthoringServiceError("Routine not found", "routine_not_found");
    }
    try {
      const saved = await this.versions.savePublishedVersion({
        id: crypto.randomUUID(),
        routineId,
        createdBy: input.practitionerId,
        createdAt: this.now(),
        name: source.name ?? "Untitled routine",
        changeSummary: null,
        restoredFromVersionId: source.id,
        copyFromVersionId: source.id,
      });
      return {
        routine_id: routineId,
        restored_from_version_number: source.version_number,
        version_number: saved.version_number,
        routine_version_id: saved.id,
      };
    } catch (err) {
      mapRepoError(err);
    }
  }

  async listVersionHistory(
    practitionerId: string,
    routineId: string,
  ): Promise<RoutineVersionHistoryResult> {
    await this.requirePractitioner(practitionerId);
    const validated = validateOpaqueEntityId(routineId, "Routine id");
    const routine = await this.routines.findVisibleToPractitioner(
      validated,
      practitionerId,
    );
    if (!routine || routine.published_version === null) {
      throw new RoutineAuthoringServiceError("Routine not found", "routine_not_found");
    }
    const versions = await this.versions.listPublishedVersionsForRoutine(validated);
    const restoredFromById = new Map<string, number>();
    for (const version of versions) {
      if (version.restored_from_version_id) {
        const restoredFrom = versions.find(
          (v) => v.id === version.restored_from_version_id,
        );
        if (restoredFrom) {
          restoredFromById.set(version.id, restoredFrom.version_number);
        }
      }
    }
    const items: RoutineVersionHistoryItem[] = [];
    for (const version of versions) {
      const rowCount = (await this.versionRows.listForVersion(version.id)).length;
      const sentRow = await this.sql.first<{ c: number }>(
        `SELECT COUNT(*) AS c FROM programs
         WHERE created_by = ? AND source_routine_id = ? AND source_routine_version_id = ?
           AND deleted_at IS NULL`,
        [practitionerId, validated, version.id],
      );
      items.push({
        routine_version_id: version.id,
        version_number: version.version_number,
        name: version.name ?? "Untitled routine",
        change_summary: version.change_summary,
        restored_from_version_number: restoredFromById.get(version.id) ?? null,
        created_by: version.created_by,
        created_at: version.created_at,
        exercise_count: rowCount,
        is_live: version.version_number === routine.published_version,
        sent_program_count: sentRow?.c ?? 0,
      });
    }
    return {
      routine_id: validated,
      live_version_number: routine.published_version,
      versions: items,
    };
  }
}
