import { categoryToLabel } from "../../domain/exercise-category-labels.js";
import {
  FreeTextValidationError,
  validateMediaRegenerationNote,
  validateRequestNote,
  validateRequestedExerciseName,
} from "../../domain/exercise-free-text.js";
import { prescriptionTypesForCategory } from "../../domain/exercise-types.js";
import {
  generateOpaqueEntityId,
  OpaqueEntityIdValidationError,
  validateOpaqueEntityId,
} from "../../domain/opaque-entity-id.js";
import type { PhysioServerConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { SqlBatchGuardError } from "../../storage/errors/sql-batch-error.js";
import {
  ExerciseRequestsRepository,
  ExerciseVersionsRepository,
  ExercisesRepository,
  PractitionerExercisesRepository,
  PractitionersRepository,
} from "../../storage/repositories/exercise-data.js";
import {
  ExerciseRequestsReadRepository,
  type SimilarInProgressRow,
} from "../../storage/repositories/exercise-requests-read.js";
import { ExerciseLibraryReadRepository } from "../../storage/repositories/exercise-library-read.js";
import type { ApprovedExerciseSummary } from "../exercise-library/types.js";
import {
  PractitionerNotFoundError,
  requirePractitionerRecord,
} from "../practitioner-access.js";
import { ProgramBuilderService } from "../programs/program-builder-service.js";
import {
  appendMergeToDraftRequest,
  fakeExerciseDraftGenerator,
} from "./fake-draft-generator.js";
import type { ExerciseDraftGenerator } from "./exercise-draft-generator-types.js";
import { DeepInfraExerciseDraftError } from "./deepinfra-exercise-draft-error.js";
import { ExerciseRequestsServiceError } from "./errors.js";
import { generateExerciseRequestDraft } from "./exercise-request-draft-generation.js";
import type { DraftGenerationWorkflowPort } from "./draft-generation-workflow-types.js";
import {
  DRAFT_GENERATION_LOCK_STALE_MS,
  isLockFresh,
} from "./draft-generation-lock.js";
import { underDraftGenerationLock } from "./exercise-request-generation-lock.js";
import { failureCodeToPhase } from "./draft-generation-failure-codes.js";
import { logDraftGenerationRunCanceled } from "./draft-generation-lock-log.js";
import { maybeLogDraftGenerationRunAbandoned } from "./maybe-log-draft-generation-run-abandoned.js";
import { logRequestWithdrawn } from "./request-withdrawn-log.js";
import type {
  ExerciseMediaService,
  InitialDraftMediaProgress,
} from "../exercise-media/exercise-media-service.js";
import { ExerciseVersionMediaRepository } from "../../storage/repositories/exercise-media.js";
import type {
  ApproveExerciseRequestResult,
  DraftFieldPatch,
  ExerciseRequestDraftView,
  GenerateExerciseRequestDraftResult,
  RegenerateDraftTextResult,
  InProgressRequestsResult,
  SimilarExercisesResult,
  SubmitExerciseRequestResult,
  SubmitResolution,
  WithdrawExerciseRequestResult,
} from "./types.js";

const SIMILAR_LIBRARY_LIMIT = 10;
const FORM_OPENED_MAX_FUTURE_SKEW_MS = 2 * 60 * 1000;

export { ExerciseRequestsServiceError } from "./errors.js";
export type { ExerciseRequestsServiceErrorCode } from "./errors.js";

function isIsoDateTimeString(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{3})?Z$/.test(value)) {
    return false;
  }
  const parsed = Date.parse(value);
  if (Number.isNaN(parsed)) {
    return false;
  }
  return new Date(parsed).toISOString() === value;
}

function assertFormOpenedAtNotFarFuture(formOpenedAt: string, nowIso: string): void {
  const openedMs = Date.parse(formOpenedAt);
  const nowMs = Date.parse(nowIso);
  if (openedMs > nowMs + FORM_OPENED_MAX_FUTURE_SKEW_MS) {
    throw new ExerciseRequestsServiceError(
      "form_opened_at must not be far in the future",
      "invalid_input",
    );
  }
}

function mapFreeTextError(err: unknown): never {
  if (err instanceof FreeTextValidationError) {
    throw new ExerciseRequestsServiceError(err.message, "invalid_input");
  }
  if (err instanceof OpaqueEntityIdValidationError) {
    throw new ExerciseRequestsServiceError(err.message, "invalid_input");
  }
  throw err;
}

function parseOpaqueId(raw: string, fieldLabel: string): string {
  try {
    return validateOpaqueEntityId(raw, fieldLabel);
  } catch (err) {
    mapFreeTextError(err);
  }
}

type ConflictPayload = {
  request_id: string;
  requested_name: string;
  exercise_note: string | null;
  requested_by: string;
  requested_by_email: string;
  status: "open" | "drafting";
  exercise_id: string | null;
  draft_title: string | null;
  submitted_at: string;
};

function mapSimilarRow(row: SimilarInProgressRow): ConflictPayload {
  return {
    request_id: row.id,
    requested_name: row.requested_name,
    exercise_note: row.note,
    requested_by: row.requested_by,
    requested_by_email: row.requested_by_email,
    status: row.status as "open" | "drafting",
    exercise_id: row.exercise_id,
    draft_title: row.draft_title,
    submitted_at: row.created_at,
  };
}

function mapLibraryRow(
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

function parseSubmitText(
  requestedName: string,
  exerciseNote?: string | null,
): {
  requestedName: string;
  exerciseNote: string | null;
} {
  try {
    return {
      requestedName: validateRequestedExerciseName(requestedName),
      exerciseNote: validateRequestNote(exerciseNote),
    };
  } catch (err) {
    mapFreeTextError(err);
  }
}

export class ExerciseRequestsService {
  private readonly requests: ExerciseRequestsRepository;
  private readonly requestsRead: ExerciseRequestsReadRepository;
  private readonly libraryRead: ExerciseLibraryReadRepository;
  private readonly versions: ExerciseVersionsRepository;
  private readonly exercises: ExercisesRepository;
  private readonly practitioners: PractitionersRepository;
  private readonly practitionerExercises: PractitionerExercisesRepository;
  private readonly draftGenerator: ExerciseDraftGenerator;
  private readonly now: () => string;
  private readonly initialDraftMediaProgress: (
    exerciseVersionId: string,
  ) => Promise<InitialDraftMediaProgress>;

  constructor(
    private readonly sql: SqlStoragePort,
    _config: PhysioServerConfig,
    options?: {
      now?: () => string;
      draftGenerator?: ExerciseDraftGenerator;
      initialDraftMediaProgress?: (
        exerciseVersionId: string,
      ) => Promise<InitialDraftMediaProgress>;
    },
  ) {
    this.requests = new ExerciseRequestsRepository(sql);
    this.requestsRead = new ExerciseRequestsReadRepository(sql);
    this.libraryRead = new ExerciseLibraryReadRepository(sql);
    this.versions = new ExerciseVersionsRepository(sql);
    this.exercises = new ExercisesRepository(sql);
    this.practitioners = new PractitionersRepository(sql);
    this.practitionerExercises = new PractitionerExercisesRepository(sql);
    this.now = options?.now ?? (() => new Date().toISOString());
    this.draftGenerator = options?.draftGenerator ?? fakeExerciseDraftGenerator;
    this.initialDraftMediaProgress =
      options?.initialDraftMediaProgress ??
      (async (exerciseVersionId) => {
        const versionMedia = new ExerciseVersionMediaRepository(this.sql);
        const mediaRow = await versionMedia.findVersion(exerciseVersionId);
        if (!mediaRow?.media_set_id) {
          return "none";
        }
        return "complete";
      });
  }

  async listSimilar(input: {
    practitionerId: string;
    query: string;
  }): Promise<SimilarExercisesResult> {
    await this.requirePractitioner(input.practitionerId);
    const query = input.query.trim();
    if (!query) {
      throw new ExerciseRequestsServiceError("Query is required", "invalid_input");
    }

    const libraryRows = await this.libraryRead.searchApproved({
      query,
      sort: "a_to_z",
      limit: SIMILAR_LIBRARY_LIMIT,
      offset: 0,
    });

    const draftRows =
      await this.requestsRead.listInProgressDraftsForSimilarQuery(query);

    return {
      library_matches: libraryRows.map(mapLibraryRow),
      drafts_in_progress: draftRows.map((row) => ({
        request_id: row.id,
        requested_name: row.requested_name,
        exercise_note: row.note,
        status: row.status as "open" | "drafting",
        exercise_id: row.exercise_id,
        draft_title: row.draft_title,
        requested_by: row.requested_by,
        requested_by_email: row.requested_by_email,
      })),
    };
  }

  async submitRequest(input: {
    practitionerId: string;
    requestedName: string;
    exerciseNote?: string | null;
    formOpenedAt: string;
    resolution?: SubmitResolution;
    conflictRequestId?: string;
  }): Promise<SubmitExerciseRequestResult> {
    await this.requirePractitioner(input.practitionerId);
    if (!isIsoDateTimeString(input.formOpenedAt)) {
      throw new ExerciseRequestsServiceError(
        "form_opened_at must be an ISO-8601 UTC timestamp",
        "invalid_input",
      );
    }
    assertFormOpenedAtNotFarFuture(input.formOpenedAt, this.now());

    const resolution = input.resolution ?? "submit";
    const { requestedName, exerciseNote } = parseSubmitText(
      input.requestedName,
      input.exerciseNote,
    );

    if (resolution === "use_existing" || resolution === "merge") {
      if (!input.conflictRequestId) {
        throw new ExerciseRequestsServiceError(
          "conflict_request_id is required for this resolution",
          "invalid_input",
        );
      }
      const conflictId = parseOpaqueId(input.conflictRequestId, "conflict_request_id");
      const target = await this.requests.findById(conflictId);
      if (!target || !["open", "drafting"].includes(target.status)) {
        throw new ExerciseRequestsServiceError(
          "Similar request not found",
          "conflict_target_not_found",
        );
      }
      if (resolution === "use_existing") {
        return {
          outcome: "used_existing",
          request_id: target.id,
          exercise_id: target.exercise_id,
        };
      }
      if (!target.exercise_id) {
        throw new ExerciseRequestsServiceError(
          "Merge target has no draft yet",
          "merge_target_not_ready",
        );
      }
      await appendMergeToDraftRequest({
        sql: this.sql,
        targetRequestId: target.id,
        mergedName: requestedName,
        mergedNote: exerciseNote,
        now: this.now(),
      });
      return {
        outcome: "merged",
        request_id: target.id,
        exercise_id: target.exercise_id,
      };
    }

    if (resolution === "submit" || resolution === "submit_anyway") {
      if (resolution === "submit") {
        const conflict = await this.requestsRead.findConflictCandidate({
          requestedBy: input.practitionerId,
          requestedName,
          formOpenedAt: input.formOpenedAt,
        });
        if (conflict) {
          return {
            outcome: "conflict",
            similar_request: mapSimilarRow(conflict),
            pending: {
              requested_name: requestedName,
              exercise_note: exerciseNote,
            },
          };
        }
      }

      const requestId = generateOpaqueEntityId();
      const timestamp = this.now();
      try {
        await this.sql.batch([
          this.requests.buildInsertBatchStatement({
            id: requestId,
            requestedName,
            note: exerciseNote,
            requestedBy: input.practitionerId,
            status: "drafting",
            createdAt: timestamp,
            updatedAt: timestamp,
          }),
        ]);
      } catch (error) {
        if (error instanceof SqlBatchGuardError) {
          throw new ExerciseRequestsServiceError("Submit failed", "submit_failed", {
            cause: error,
          });
        }
        throw error;
      }

      return {
        outcome: "created",
        request_id: requestId,
        status: "drafting",
        exercise_id: null,
      };
    }

    throw new ExerciseRequestsServiceError("Invalid resolution", "invalid_input");
  }

  async listInProgress(input: {
    practitionerId: string;
  }): Promise<InProgressRequestsResult> {
    await this.requirePractitioner(input.practitionerId);
    const rows = await this.requestsRead.listInProgress();
    const count = await this.requests.countInProgress();
    const nowIso = this.now();
    return {
      in_progress_count: count,
      requests: rows.map((row) => ({
        request_id: row.id,
        requested_name: row.requested_name,
        exercise_note: row.note,
        status: row.status as "open" | "drafting",
        requested_by: row.requested_by,
        requested_by_email: row.requested_by_email,
        exercise_id: row.exercise_id,
        draft_title: row.draft_title,
        updated_at: row.updated_at,
        generation_in_progress: isLockFresh(row.draft_generation_locked_at, nowIso),
      })),
    };
  }

  async getInProgressCount(input: { practitionerId: string }): Promise<number> {
    await this.requirePractitioner(input.practitionerId);
    return this.requests.countInProgress();
  }

  async getRequest(input: {
    practitionerId: string;
    requestId: string;
  }): Promise<ExerciseRequestDraftView> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");
    const row = await this.requests.findById(requestId);
    const nowIso = this.now();
    const lockedAt = row?.draft_generation_locked_at ?? null;
    if (
      lockedAt &&
      !isLockFresh(lockedAt, nowIso) &&
      row?.draft_generation_attempt_id
    ) {
      await maybeLogDraftGenerationRunAbandoned({
        requests: this.requests,
        requestId,
        attemptId: row.draft_generation_attempt_id,
        lockedAt,
        now: nowIso,
      });
    }
    return this.buildDraftView(requestId);
  }

  async regenerateDraftText(input: {
    practitionerId: string;
    requestId: string;
    note?: string | null;
  }): Promise<RegenerateDraftTextResult> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");
    const row = await this.requests.findById(requestId);
    if (!row || row.status !== "drafting" || !row.exercise_id) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }
    if (row.requested_by !== input.practitionerId) {
      throw new ExerciseRequestsServiceError(
        "Only the requester can run draft generation",
        "generation_not_requester",
      );
    }
    const draft = await this.versions.findDraftForExercise(row.exercise_id);
    if (!draft) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }
    let regenerationNote: string | null;
    try {
      regenerationNote = validateMediaRegenerationNote(input.note);
    } catch (err) {
      mapFreeTextError(err);
    }
    const now = this.now();
    const locked = await underDraftGenerationLock({
      requestId,
      now,
      requests: this.requests,
      loadView: () => this.buildDraftView(requestId),
      run: async () => {
        try {
          await this.draftGenerator(
            {
              sql: this.sql,
              requestId,
              requestedName: row.requested_name,
              exerciseNote: row.note,
              regenerationNote,
              requestedBy: row.requested_by,
              now,
              existingExerciseId: row.exercise_id!,
              existingVersionId: draft.id,
              providerAttempts: 2,
            },
            {
              exercises: this.exercises,
              versions: this.versions,
              requests: this.requests,
            },
          );
        } catch (error) {
          if (error instanceof DeepInfraExerciseDraftError) {
            return {
              outcome: "text_failed" as const,
              error: error.code,
              view: null,
            };
          }
          throw error;
        }
        const view = await this.buildDraftView(requestId);
        return { outcome: "complete" as const, view };
      },
    });
    if (locked.kind === "in_progress") {
      return {
        outcome: "in_progress",
        view: locked.view,
        started_elsewhere: locked.started_elsewhere,
      };
    }
    return locked.result;
  }

  async generateRequest(input: {
    practitionerId: string;
    requestId: string;
    mediaService: ExerciseMediaService;
    workflow?: DraftGenerationWorkflowPort;
  }): Promise<GenerateExerciseRequestDraftResult> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");
    const versionMedia = new ExerciseVersionMediaRepository(this.sql);
    const loadView = (id: string) => this.loadDraftView(id);
    const runDeps = {
      sql: this.sql,
      draftGenerator: this.draftGenerator,
      now: this.now,
      requests: this.requests,
      exercises: this.exercises,
      versions: this.versions,
      versionMedia,
    };
    if (!input.workflow) {
      throw new ExerciseRequestsServiceError(
        "Draft generation workflow is not configured",
        "draft_generation_workflow_unavailable",
      );
    }
    return generateExerciseRequestDraft({
      practitionerId: input.practitionerId,
      requestId,
      mediaService: input.mediaService,
      loadView,
      deps: {
        ...runDeps,
        workflow: input.workflow,
      },
    });
  }

  async loadDraftView(requestId: string): Promise<ExerciseRequestDraftView> {
    return this.buildDraftView(parseOpaqueId(requestId, "request_id"));
  }

  private async buildDraftView(requestId: string): Promise<ExerciseRequestDraftView> {
    const row = await this.requestsRead.findInProgressRequestById(requestId);
    if (!row) {
      throw new ExerciseRequestsServiceError("Request not found", "request_not_found");
    }

    const lockRow = await this.requests.findById(requestId);
    const nowIso = this.now();
    const generationInProgress = isLockFresh(
      lockRow?.draft_generation_locked_at ?? null,
      nowIso,
    );

    let draft: ExerciseRequestDraftView["draft"] = null;
    let firstDraftComplete = false;
    if (row.exercise_id) {
      const versionRow = await this.requestsRead.findDraftVersionDetailForExercise(
        row.exercise_id,
      );
      if (versionRow) {
        draft = {
          exercise_version_id: versionRow.id,
          version_number: versionRow.version_number,
          title: versionRow.title,
          description: versionRow.description,
          equipment: versionRow.equipment,
          starting_position: versionRow.starting_position,
          steps: versionRow.steps,
          common_mistakes: versionRow.common_mistakes,
          regressions: versionRow.regressions,
          progressions: versionRow.progressions,
          precautions: versionRow.precautions,
          cue_stretching: versionRow.cue_stretching,
          cue_isometric: versionRow.cue_isometric,
          cue_concentric: versionRow.cue_concentric,
          cue_eccentric: versionRow.cue_eccentric,
        };
        const mediaProgress = await this.initialDraftMediaProgress(versionRow.id);
        firstDraftComplete = mediaProgress === "complete";
      }
    }

    return {
      request_id: row.id,
      requested_name: row.requested_name,
      exercise_note: row.note,
      status: row.status as "open" | "drafting",
      requested_by: row.requested_by,
      requested_by_email:
        (await this.practitioners.findById(row.requested_by))?.email ?? "",
      exercise_id: row.exercise_id,
      generation: {
        generation_in_progress: generationInProgress,
        first_draft_complete: firstDraftComplete,
        draft_generation_locked_at: lockRow?.draft_generation_locked_at ?? null,
        generation_failure: failureCodeToPhase(
          lockRow?.draft_generation_failure_code ?? null,
        ),
        generation_failure_code: lockRow?.draft_generation_failure_code ?? null,
      },
      draft,
    };
  }

  async updateDraft(input: {
    practitionerId: string;
    requestId: string;
    patch: DraftFieldPatch;
  }): Promise<ExerciseRequestDraftView> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");
    const row = await this.requests.findById(requestId);
    if (!row || row.status !== "drafting" || !row.exercise_id) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }
    const draft = await this.versions.findDraftForExercise(row.exercise_id);
    if (!draft) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }

    if (Object.keys(input.patch).length > 0) {
      try {
        const updated = await this.versions.updateDraftFields(draft.id, {
          title: input.patch.title,
          description: input.patch.description,
          equipment: input.patch.equipment,
          startingPosition: input.patch.starting_position,
          steps: input.patch.steps,
          commonMistakes: input.patch.common_mistakes,
          regressions: input.patch.regressions,
          progressions: input.patch.progressions,
          precautions: input.patch.precautions,
          cueStretching: input.patch.cue_stretching,
          cueIsometric: input.patch.cue_isometric,
          cueConcentric: input.patch.cue_concentric,
          cueEccentric: input.patch.cue_eccentric,
        });
        if (!updated) {
          throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
        }
      } catch (err) {
        mapFreeTextError(err);
      }
    }

    try {
      await this.sql.batch([
        this.requests.buildUpdateStatusBatchStatement({
          id: row.id,
          status: "drafting",
          updatedAt: this.now(),
          allowedFromStatuses: ["open", "drafting"],
        }),
      ]);
    } catch (error) {
      if (error instanceof SqlBatchGuardError) {
        throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
      }
      throw error;
    }

    return this.getRequest({ practitionerId: input.practitionerId, requestId: row.id });
  }

  async approveRequest(input: {
    practitionerId: string;
    requestId: string;
  }): Promise<ApproveExerciseRequestResult> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");
    const row = await this.requests.findById(requestId);
    if (!row) {
      throw new ExerciseRequestsServiceError("Request not found", "request_not_found");
    }
    if (row.status === "approved") {
      throw new ExerciseRequestsServiceError(
        "Request already approved",
        "request_already_approved",
      );
    }
    if (row.status !== "drafting" || !row.exercise_id) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }
    const draft = await this.versions.findDraftForExercise(row.exercise_id);
    if (!draft || draft.version_number !== 1) {
      throw new ExerciseRequestsServiceError("Draft not ready", "draft_not_ready");
    }

    const approvedAt = this.now();
    const programBuilder = new ProgramBuilderService(this.sql, () => approvedAt);
    const batchStatements = [
      this.versions.buildApproveDraftBatchStatement({
        versionId: draft.id,
        approvedBy: input.practitionerId,
        approvedAt,
      }),
      this.requests.buildUpdateStatusBatchStatement({
        id: row.id,
        status: "approved",
        updatedAt: approvedAt,
        allowedFromStatuses: ["drafting"],
      }),
      this.practitionerExercises.buildSaveExerciseBatchStatement({
        practitionerId: row.requested_by,
        exerciseId: row.exercise_id,
        savedAt: approvedAt,
      }),
    ];
    const skippedCount = await programBuilder.linkApprovedPlaceholders(
      requestId,
      draft.id,
      { appendStatementsTo: batchStatements },
    );

    try {
      await this.sql.batch(batchStatements);
    } catch (error) {
      if (error instanceof SqlBatchGuardError) {
        throw new ExerciseRequestsServiceError("Approve failed", "approve_failed");
      }
      throw error;
    }

    return {
      request_id: row.id,
      exercise_id: row.exercise_id,
      exercise_version_id: draft.id,
      version_number: 1,
      approved_by: input.practitionerId,
      approved_at: approvedAt,
      skipped_count: skippedCount,
    };
  }

  async withdrawRequest(input: {
    practitionerId: string;
    requestId: string;
  }): Promise<WithdrawExerciseRequestResult> {
    await this.requirePractitioner(input.practitionerId);
    const requestId = parseOpaqueId(input.requestId, "request_id");
    const nowIso = this.now();
    const staleBefore = new Date(
      Date.parse(nowIso) - DRAFT_GENERATION_LOCK_STALE_MS,
    ).toISOString();

    const rowBeforeWithdraw = await this.requests.findById(requestId);

    const wrote = await this.requests.tryWithdrawToWithdrawn({
      id: requestId,
      updatedAt: nowIso,
      lockStaleBefore: staleBefore,
    });
    if (wrote) {
      if (rowBeforeWithdraw) {
        logRequestWithdrawn({
          requestId,
          practitionerId: input.practitionerId,
          requesterPractitionerId: rowBeforeWithdraw.requested_by,
          previousStatus: rowBeforeWithdraw.status,
        });
        if (
          rowBeforeWithdraw.draft_generation_attempt_id &&
          rowBeforeWithdraw.draft_generation_locked_at
        ) {
          logDraftGenerationRunCanceled({
            requestId,
            attemptId: rowBeforeWithdraw.draft_generation_attempt_id,
            lockedAt: rowBeforeWithdraw.draft_generation_locked_at,
            now: nowIso,
          });
        }
      }
      return {
        request_id: requestId,
        status: "withdrawn",
        already_withdrawn: false,
      };
    }

    const row = await this.requests.findById(requestId);
    if (!row) {
      throw new ExerciseRequestsServiceError("Request not found", "request_not_found");
    }
    if (row.status === "withdrawn") {
      return {
        request_id: requestId,
        status: "withdrawn",
        already_withdrawn: true,
      };
    }
    if (row.status === "approved") {
      throw new ExerciseRequestsServiceError(
        "Request not deletable",
        "request_not_deletable",
      );
    }
    if (isLockFresh(row.draft_generation_locked_at, nowIso)) {
      throw new ExerciseRequestsServiceError(
        "Draft generation is in progress",
        "draft_generation_in_progress",
      );
    }
    throw new ExerciseRequestsServiceError(
      "Request not deletable",
      "request_not_deletable",
    );
  }

  private async requirePractitioner(practitionerId: string): Promise<void> {
    try {
      await requirePractitionerRecord(this.practitioners, practitionerId);
    } catch (err) {
      if (err instanceof PractitionerNotFoundError) {
        throw new ExerciseRequestsServiceError(
          "Practitioner not found",
          "practitioner_not_found",
        );
      }
      throw err;
    }
  }
}
