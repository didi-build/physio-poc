import { parseExerciseParamsJson } from "../../domain/exercise-params.js";
import { validateOpaqueEntityId } from "../../domain/opaque-entity-id.js";
import type { PhysioServerConfig } from "../../http/config.js";
import {
  buildPhysioAppUrl,
  buildWebAppRoutineSearchUrl,
} from "../../mcp-connector/urls.js";
import { ProgramBuilderService } from "../programs/program-builder-service.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { PractitionersRepository } from "../../storage/repositories/exercise-data.js";
import {
  RoutineLibraryReadRepository,
  type PublishedRoutineSearchRow,
  type RoutineSearchSort,
} from "../../storage/repositories/routine-library-read.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import {
  ConditionsRepository,
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
  RoutineRepositoryError,
  RoutineVersionRowsRepository,
  RoutineVersionsRepository,
  RoutinesRepository,
  type PractitionerRoutineRecord,
} from "../../storage/repositories/routines.js";
import { ExerciseLibraryReadRepository } from "../../storage/repositories/exercise-library-read.js";
import {
  PractitionerNotFoundError,
  requirePractitionerRecord,
} from "../practitioner-access.js";
import {
  communityChangeListUnavailable,
  personalChangesUnavailable,
  projectPersonalChanges,
  savedBaselineVersionIsAvailable,
  type RoutineRowComparable,
} from "./routine-personal-change-projection.js";
import type {
  CommunityRoutineSummary,
  McpRoutineSearchSummary,
  MyRoutineDraftItem,
  MyRoutineSavedItem,
  MyRoutinesListResult,
  RoutineDetailsResult,
  RoutineExerciseRow,
  RoutineMutationUndo,
  RoutineUndoCopySnapshot,
  RoutineUndoRowSnapshot,
  RoutineUndoSnapshot,
  SearchCommunityRoutinesResult,
  SearchRoutinesMcpResult,
} from "./types.js";

const DEFAULT_SEARCH_LIMIT = 10;
const MAX_SEARCH_LIMIT = 25;

export class RoutinesLibraryServiceError extends Error {
  constructor(
    message: string,
    readonly code:
      | "practitioner_not_found"
      | "routine_not_found"
      | "my_routine_not_found"
      | "invalid_input"
      | "undo_mismatch"
      | "routine_not_published"
      | "stale_write",
  ) {
    super(message);
    this.name = "RoutinesLibraryServiceError";
  }
}

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
    throw new RoutinesLibraryServiceError("Invalid cursor", "invalid_input");
  }
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function mapRoutineRepositoryError(err: unknown): never {
  if (err instanceof RoutineRepositoryError) {
    if (err.code === "stale_write") {
      throw new RoutinesLibraryServiceError("Stale write", "stale_write");
    }
    const message = err.message;
    if (message === "Saved routine copy not found") {
      throw new RoutinesLibraryServiceError(message, "my_routine_not_found");
    }
    if (message === "Cannot save an empty routine copy") {
      throw new RoutinesLibraryServiceError(message, "invalid_input");
    }
    if (message === "Routine is not published" || message.includes("not published")) {
      throw new RoutinesLibraryServiceError(message, "routine_not_published");
    }
    if (message === "Routine not found") {
      throw new RoutinesLibraryServiceError(message, "routine_not_found");
    }
    throw new RoutinesLibraryServiceError(message, "invalid_input");
  }
  throw err;
}

export function parseRoutineMutationUndo(value: unknown): RoutineMutationUndo {
  if (!isPlainObject(value)) {
    throw new RoutinesLibraryServiceError("Invalid undo payload", "invalid_input");
  }
  if (
    typeof value.practitioner_id !== "string" ||
    typeof value.routine_id !== "string"
  ) {
    throw new RoutinesLibraryServiceError("Invalid undo payload", "invalid_input");
  }
  if (!isPlainObject(value.snapshot)) {
    throw new RoutinesLibraryServiceError("Undo snapshot required", "invalid_input");
  }
  const snap = value.snapshot;
  if (typeof snap.had_copy !== "boolean") {
    throw new RoutinesLibraryServiceError("Invalid had_copy in undo", "invalid_input");
  }
  let copy: RoutineUndoCopySnapshot | null = null;
  if (snap.copy !== null) {
    if (!isPlainObject(snap.copy)) {
      throw new RoutinesLibraryServiceError("Invalid copy in undo", "invalid_input");
    }
    const raw = snap.copy;
    if (
      typeof raw.id !== "string" ||
      typeof raw.source_routine_version_id !== "string" ||
      typeof raw.source_version_number !== "number" ||
      typeof raw.saved_at !== "string" ||
      typeof raw.edited !== "number" ||
      !Array.isArray(raw.rows)
    ) {
      throw new RoutinesLibraryServiceError("Invalid copy in undo", "invalid_input");
    }
    const rows: RoutineUndoRowSnapshot[] = [];
    for (const row of raw.rows) {
      if (!isPlainObject(row)) {
        throw new RoutinesLibraryServiceError("Invalid undo row", "invalid_input");
      }
      if (
        typeof row.position !== "number" ||
        typeof row.exercise_id !== "string" ||
        typeof row.exercise_version_id !== "string" ||
        typeof row.prescription_type !== "string" ||
        typeof row.params_json !== "string"
      ) {
        throw new RoutinesLibraryServiceError("Invalid undo row", "invalid_input");
      }
      rows.push({
        position: row.position,
        exercise_id: row.exercise_id,
        exercise_version_id: row.exercise_version_id,
        prescription_type: row.prescription_type as PrescriptionType,
        params_json: row.params_json,
      });
    }
    copy = {
      id: raw.id,
      source_routine_version_id: raw.source_routine_version_id,
      source_version_number: raw.source_version_number,
      saved_at: raw.saved_at,
      last_used_at:
        raw.last_used_at === null
          ? null
          : typeof raw.last_used_at === "string"
            ? raw.last_used_at
            : null,
      edited: raw.edited,
      rows,
    };
  }
  return {
    practitioner_id: value.practitioner_id,
    routine_id: value.routine_id,
    snapshot: { had_copy: snap.had_copy, copy },
  };
}

export class RoutinesLibraryService {
  private readonly libraryRead: RoutineLibraryReadRepository;
  private readonly routines: RoutinesRepository;
  private readonly versions: RoutineVersionsRepository;
  private readonly versionRows: RoutineVersionRowsRepository;
  private readonly myCopies: PractitionerRoutinesRepository;
  private readonly myCopyRows: PractitionerRoutineRowsRepository;
  private readonly conditions: ConditionsRepository;
  private readonly exerciseRead: ExerciseLibraryReadRepository;
  private readonly practitioners: PractitionersRepository;
  private readonly programs: ProgramBuilderService;
  private readonly now: () => string;

  constructor(
    private readonly sql: SqlStoragePort,
    private readonly config: PhysioServerConfig,
    options?: { now?: () => string },
  ) {
    this.libraryRead = new RoutineLibraryReadRepository(sql);
    this.routines = new RoutinesRepository(sql);
    this.versions = new RoutineVersionsRepository(sql);
    this.versionRows = new RoutineVersionRowsRepository(sql);
    this.myCopies = new PractitionerRoutinesRepository(sql);
    this.myCopyRows = new PractitionerRoutineRowsRepository(sql);
    this.conditions = new ConditionsRepository(sql);
    this.exerciseRead = new ExerciseLibraryReadRepository(sql);
    this.practitioners = new PractitionersRepository(sql);
    this.programs = new ProgramBuilderService(sql);
    this.now = options?.now ?? (() => new Date().toISOString());
  }

  async conditionsAvailable(): Promise<boolean> {
    const rows = await this.conditions.listAll();
    return rows.length > 0;
  }

  private async conditionOptionsForUi(
    conditionsAvailable: boolean,
  ): Promise<{ condition_id: string; label: string }[]> {
    if (!conditionsAvailable) {
      return [];
    }
    const rows = await this.conditions.listAll();
    return rows.map((row) => ({ condition_id: row.id, label: row.label }));
  }

  async searchCommunityRoutines(input: {
    practitionerId: string;
    query?: string;
    bodyRegion?: string;
    conditionId?: string;
    sort?: RoutineSearchSort;
    limit?: number;
    cursor?: string;
  }): Promise<SearchCommunityRoutinesResult> {
    await this.requirePractitioner(input.practitionerId);
    const conditionsAvailable = await this.conditionsAvailable();
    const conditionId =
      conditionsAvailable && input.conditionId?.trim()
        ? validateOpaqueEntityId(input.conditionId.trim(), "Condition id")
        : undefined;

    const limit = Math.min(
      MAX_SEARCH_LIMIT,
      Math.max(1, input.limit ?? DEFAULT_SEARCH_LIMIT),
    );
    const offset = input.cursor ? decodeCursor(input.cursor) : 0;
    const sort = input.sort ?? "most_used";

    const totalCount = await this.libraryRead.countPublishedSearch({
      query: input.query,
      bodyRegionLabel: input.bodyRegion,
      conditionId,
      includeConditionInTextSearch: conditionsAvailable,
    });

    const rows = await this.libraryRead.searchPublished({
      query: input.query,
      bodyRegionLabel: input.bodyRegion,
      conditionId,
      includeConditionInTextSearch: conditionsAvailable,
      sort,
      limit: limit + 1,
      offset,
    });

    const page = rows.slice(0, limit);
    const nextOffset = offset + page.length;
    const next_cursor =
      rows.length > limit && nextOffset < totalCount ? encodeCursor(nextOffset) : null;

    const savedIds = new Set(
      (await this.myCopies.listSavedForPractitioner(input.practitionerId)).map(
        (copy) => copy.routine_id,
      ),
    );

    const routines: CommunityRoutineSummary[] = page.map((row) => ({
      routine_id: row.routine_id,
      routine_version_id: row.routine_version_id,
      name: row.name,
      version_number: row.version_number,
      body_region_label: row.body_region_label,
      condition_label: conditionsAvailable ? row.condition_label : null,
      exercise_count: row.exercise_count,
      usage_count: row.usage_count,
      added_by_you: row.created_by === input.practitionerId,
      in_my_routines: savedIds.has(row.routine_id),
    }));

    const trimmedQuery = input.query?.trim() ?? "";
    const search_link =
      page.length === 0 && trimmedQuery.length > 0
        ? buildWebAppRoutineSearchUrl(this.config.webAppBaseUrl, trimmedQuery)
        : null;

    return {
      routines,
      next_cursor,
      search_link,
      total_count: totalCount,
      conditions_available: conditionsAvailable,
      condition_options: await this.conditionOptionsForUi(conditionsAvailable),
    };
  }

  async searchRoutinesForMcp(input: {
    practitionerId: string;
    query: string;
    limit?: number;
    cursor?: string;
  }): Promise<SearchRoutinesMcpResult> {
    const result = await this.searchCommunityRoutines({
      practitionerId: input.practitionerId,
      query: input.query,
      limit: input.limit,
      cursor: input.cursor,
    });
    const mcpRoutines: McpRoutineSearchSummary[] = result.routines.map((row) => ({
      routine_id: row.routine_id,
      routine_name: row.name,
      routine_version: row.version_number,
      exercise_count: row.exercise_count,
      source: "community",
    }));
    const summary =
      mcpRoutines.length === 0
        ? `No published routines matched "${input.query.trim()}".`
        : `Found ${mcpRoutines.length} published routine(s) matching "${input.query.trim()}".`;
    return {
      summary,
      share_link: "",
      manage_url: buildPhysioAppUrl(this.config.webAppBaseUrl, "routines"),
      routines: mcpRoutines,
      next_cursor: result.next_cursor,
    };
  }

  async searchOwnerPublishedRoutinesForMcp(input: {
    practitionerId: string;
    query: string;
    limit?: number;
    cursor?: string;
  }): Promise<SearchRoutinesMcpResult> {
    await this.requirePractitioner(input.practitionerId);
    const limit = Math.min(
      MAX_SEARCH_LIMIT,
      Math.max(1, input.limit ?? DEFAULT_SEARCH_LIMIT),
    );
    const offset = input.cursor ? decodeCursor(input.cursor) : 0;
    const conditionsAvailable = await this.conditionsAvailable();

    const totalCount = await this.libraryRead.countPublishedSearch({
      query: input.query,
      includeConditionInTextSearch: conditionsAvailable,
      createdBy: input.practitionerId,
    });

    const rows = await this.libraryRead.searchPublished({
      query: input.query,
      includeConditionInTextSearch: conditionsAvailable,
      createdBy: input.practitionerId,
      sort: "a_to_z",
      limit: limit + 1,
      offset,
    });

    const page = rows.slice(0, limit);
    const nextOffset = offset + page.length;
    const next_cursor =
      rows.length > limit && nextOffset < totalCount ? encodeCursor(nextOffset) : null;

    const mcpRoutines: McpRoutineSearchSummary[] = page.map((row) => ({
      routine_id: row.routine_id,
      routine_name: row.name,
      routine_version: row.version_number,
      exercise_count: row.exercise_count,
      source: "community",
    }));
    return {
      summary: "",
      share_link: "",
      manage_url: buildPhysioAppUrl(this.config.webAppBaseUrl, "routines"),
      routines: mcpRoutines,
      next_cursor,
    };
  }

  async findOwnerPublishedRoutineHead(
    practitionerId: string,
    routineId: string,
  ): Promise<PublishedRoutineSearchRow | null> {
    await this.requirePractitioner(practitionerId);
    const validatedRoutineId = validateOpaqueEntityId(routineId, "Routine id");
    const head = await this.libraryRead.getPublishedHead(validatedRoutineId);
    if (!head || head.created_by !== practitionerId) {
      return null;
    }
    return head;
  }

  async listMyRoutines(input: {
    practitionerId: string;
    query?: string;
    bodyRegion?: string;
    conditionId?: string;
  }): Promise<MyRoutinesListResult> {
    await this.requirePractitioner(input.practitionerId);
    const conditionsAvailable = await this.conditionsAvailable();
    const conditionId =
      conditionsAvailable && input.conditionId?.trim()
        ? validateOpaqueEntityId(input.conditionId.trim(), "Condition id")
        : undefined;

    const draftRecords = await this.routines.listDraftsForAuthor(input.practitionerId);
    const savedRecords = await this.myCopies.listSavedForPractitioner(
      input.practitionerId,
    );

    const trimmedQuery = input.query?.trim();
    const bodyRegion = input.bodyRegion?.trim();

    const draftMatches = async (
      draft: Awaited<ReturnType<RoutinesRepository["listDraftsForAuthor"]>>[number],
      name: string | null,
    ): Promise<boolean> => {
      if (conditionId && draft.condition_id !== conditionId) {
        return false;
      }
      if (bodyRegion) {
        const label = await this.bodyRegionLabel(draft.body_region_id);
        if (label.toLowerCase() !== bodyRegion.toLowerCase()) {
          return false;
        }
      }
      if (trimmedQuery) {
        const needle = trimmedQuery.toLowerCase();
        const nameHit = name?.toLowerCase().includes(needle) ?? false;
        if (!nameHit) {
          return false;
        }
      }
      return true;
    };

    const savedMatches = async (routineId: string, name: string): Promise<boolean> => {
      if (!trimmedQuery && !bodyRegion && !conditionId) {
        return true;
      }
      const narrowed = await this.libraryRead.searchPublished({
        query: trimmedQuery || undefined,
        bodyRegionLabel: bodyRegion,
        conditionId,
        includeConditionInTextSearch: conditionsAvailable,
        sort: "a_to_z",
        limit: 100,
        offset: 0,
      });
      if (narrowed.some((row) => row.routine_id === routineId)) {
        return true;
      }
      if (trimmedQuery && name.toLowerCase().includes(trimmedQuery.toLowerCase())) {
        return true;
      }
      return false;
    };

    const drafts: MyRoutineDraftItem[] = [];
    for (const draft of draftRecords) {
      const draftVersion = await this.versions.findDraftForRoutine(draft.id);
      const name = draftVersion?.name ?? null;
      if (!(await draftMatches(draft, name))) {
        continue;
      }
      const head = await this.libraryRead.getPublishedHead(draft.id);
      const bodyRegion =
        head?.body_region_label ?? (await this.bodyRegionLabel(draft.body_region_id));
      drafts.push({
        routine_id: draft.id,
        name,
        draft_updated_at: draft.draft_updated_at,
        body_region_label: bodyRegion,
        condition_label: conditionsAvailable ? (head?.condition_label ?? null) : null,
      });
    }

    const saved: MyRoutineSavedItem[] = [];
    let flaggedCount = 0;
    for (const copy of savedRecords) {
      const routine = await this.routines.findById(copy.routine_id);
      if (!routine) {
        continue;
      }
      const head = await this.libraryRead.getPublishedHead(copy.routine_id);
      const publishedName =
        head?.name ??
        (await this.versions.findById(copy.source_routine_version_id))?.name ??
        "Untitled routine";
      if (!(await savedMatches(copy.routine_id, publishedName))) {
        continue;
      }
      const copyRows = await this.myCopyRows.listForCopy(copy.id);
      const communityUpdated = this.myCopies.hasCommunityUpdateFlag(copy, routine);
      if (communityUpdated) {
        flaggedCount += 1;
      }
      saved.push({
        routine_id: copy.routine_id,
        name: publishedName,
        saved_copy_version: copy.source_version_number,
        community_version: routine.published_version,
        edited: copy.edited === 1,
        saved_at: copy.saved_at,
        last_used_at: copy.last_used_at,
        community_updated: communityUpdated,
        body_region_label: head?.body_region_label ?? "",
        condition_label: conditionsAvailable ? (head?.condition_label ?? null) : null,
        exercise_count: copyRows.length,
      });
    }

    return {
      drafts,
      saved,
      flagged_count: flaggedCount,
      conditions_available: conditionsAvailable,
      condition_options: await this.conditionOptionsForUi(conditionsAvailable),
    };
  }

  async getRoutineDetails(
    practitionerId: string,
    routineId: string,
  ): Promise<RoutineDetailsResult> {
    await this.requirePractitioner(practitionerId);
    const validatedRoutineId = validateOpaqueEntityId(routineId, "Routine id");
    const routine = await this.routines.findVisibleToPractitioner(
      validatedRoutineId,
      practitionerId,
    );
    if (!routine) {
      throw new RoutinesLibraryServiceError("Routine not found", "routine_not_found");
    }
    if (routine.published_version === null) {
      const draftOnly = routine.created_by === practitionerId;
      if (!draftOnly) {
        throw new RoutinesLibraryServiceError("Routine not found", "routine_not_found");
      }
      throw new RoutinesLibraryServiceError(
        "Routine is not published",
        "routine_not_published",
      );
    }

    const conditionsAvailable = await this.conditionsAvailable();
    const head = await this.libraryRead.getPublishedHead(validatedRoutineId);
    if (!head) {
      throw new RoutinesLibraryServiceError("Routine not found", "routine_not_found");
    }

    const communityRows = await this.buildCommunityRows(head.routine_version_id);
    const myCopyRecord = await this.myCopies.findForPractitioner(
      practitionerId,
      validatedRoutineId,
    );
    let myCopy: RoutineDetailsResult["my_copy"] = null;
    if (myCopyRecord) {
      const rows = await this.buildMyCopyRows(myCopyRecord.id);
      myCopy = {
        practitioner_routine_id: myCopyRecord.id,
        source_version_number: myCopyRecord.source_version_number,
        edited: myCopyRecord.edited === 1,
        community_updated: this.myCopies.hasCommunityUpdateFlag(myCopyRecord, routine),
        rows,
      };
    }

    const sent = await this.programs.getRoutineSentProgramStats(
      practitionerId,
      validatedRoutineId,
    );

    let personal_changes: RoutineDetailsResult["personal_changes"] = null;
    let community_change_list: RoutineDetailsResult["community_change_list"] = null;

    if (myCopyRecord) {
      const baselineVersion = await this.versions.findById(
        myCopyRecord.source_routine_version_id,
      );
      const baselineAvailable = savedBaselineVersionIsAvailable(
        baselineVersion,
        validatedRoutineId,
        myCopyRecord.source_version_number,
      );
      if (!baselineAvailable) {
        personal_changes = personalChangesUnavailable();
      } else {
        const baselineRaw = await this.versionRows.listForVersion(baselineVersion!.id);
        const baseline: RoutineRowComparable[] = baselineRaw.map((row) => ({
          exercise_id: row.exercise_id,
          exercise_version_id: row.exercise_version_id,
          prescription_type: row.prescription_type,
          params: parseExerciseParamsJson(row.params_json),
        }));
        const current: RoutineRowComparable[] = (myCopy?.rows ?? []).map((row) => ({
          exercise_id: row.exercise_id,
          exercise_version_id: row.exercise_version_id,
          prescription_type: row.prescription_type,
          params: row.params,
        }));
        personal_changes = projectPersonalChanges(baseline, current);
      }
      if (myCopy?.community_updated) {
        if (!baselineAvailable) {
          community_change_list = communityChangeListUnavailable();
        } else {
          const newerVersions = await this.versions.listPublishedVersionsAfterBaseline(
            validatedRoutineId,
            baselineVersion!.version_number,
          );
          community_change_list = {
            baseline_available: true,
            entries: newerVersions.map((version) => ({
              version_number: version.version_number,
              change_summary: version.change_summary,
            })),
          };
        }
      }
    }

    return {
      routine_id: validatedRoutineId,
      body_region_label: head.body_region_label,
      condition_label: conditionsAvailable ? head.condition_label : null,
      who_its_for: routine.who_its_for,
      community: {
        routine_version_id: head.routine_version_id,
        version_number: head.version_number,
        name: head.name,
        updated_at: head.published_at,
        created_by: head.created_by,
        usage_count: head.usage_count,
        rows: communityRows,
      },
      my_copy: myCopy,
      sent_program_count: sent.sent_count,
      sent_program_codes: sent.codes,
      conditions_available: conditionsAvailable,
      personal_changes,
      community_change_list,
    };
  }

  async saveToMyRoutines(
    practitionerId: string,
    routineId: string,
  ): Promise<{ undo: RoutineMutationUndo }> {
    await this.requirePractitioner(practitionerId);
    const validatedRoutineId = validateOpaqueEntityId(routineId, "Routine id");
    const head = await this.libraryRead.getPublishedHead(validatedRoutineId);
    if (!head) {
      throw new RoutinesLibraryServiceError(
        "Routine is not published",
        "routine_not_published",
      );
    }
    const undo = await this.captureUndoSnapshot(practitionerId, validatedRoutineId);
    const existing = await this.myCopies.findForPractitioner(
      practitionerId,
      validatedRoutineId,
    );
    if (existing) {
      return { undo };
    }
    const sourceRows = await this.versionRows.listForVersion(head.routine_version_id);
    try {
      await this.myCopies.saveFrozenCopy({
        id: crypto.randomUUID(),
        practitionerId,
        routineId: validatedRoutineId,
        sourceRoutineVersionId: head.routine_version_id,
        savedAt: this.now(),
        rows: sourceRows.map((row) => ({
          id: crypto.randomUUID(),
          position: row.position,
          exerciseId: row.exercise_id,
          exerciseVersionId: row.exercise_version_id,
          prescriptionType: row.prescription_type,
          params: parseExerciseParamsJson(row.params_json),
        })),
      });
    } catch (err) {
      mapRoutineRepositoryError(err);
    }
    return { undo };
  }

  async removeFromMyRoutines(
    practitionerId: string,
    routineId: string,
  ): Promise<{ undo: RoutineMutationUndo }> {
    await this.requirePractitioner(practitionerId);
    const validatedRoutineId = validateOpaqueEntityId(routineId, "Routine id");
    const existing = await this.myCopies.findForPractitioner(
      practitionerId,
      validatedRoutineId,
    );
    if (!existing) {
      throw new RoutinesLibraryServiceError(
        "Saved routine copy not found",
        "my_routine_not_found",
      );
    }
    const undo = await this.captureUndoSnapshot(practitionerId, validatedRoutineId);
    try {
      await this.myCopies.deleteCopy(practitionerId, validatedRoutineId);
    } catch (err) {
      mapRoutineRepositoryError(err);
    }
    return { undo };
  }

  async adoptCommunityVersion(
    practitionerId: string,
    routineId: string,
  ): Promise<{ undo: RoutineMutationUndo; adopted_version: number }> {
    await this.requirePractitioner(practitionerId);
    const validatedRoutineId = validateOpaqueEntityId(routineId, "Routine id");
    const head = await this.libraryRead.getPublishedHead(validatedRoutineId);
    if (!head) {
      throw new RoutinesLibraryServiceError(
        "Routine is not published",
        "routine_not_published",
      );
    }
    const existing = await this.myCopies.findForPractitioner(
      practitionerId,
      validatedRoutineId,
    );
    if (!existing) {
      throw new RoutinesLibraryServiceError(
        "Saved routine copy not found",
        "my_routine_not_found",
      );
    }
    const undo = await this.captureUndoSnapshot(practitionerId, validatedRoutineId);
    const sourceRows = await this.versionRows.listForVersion(head.routine_version_id);
    try {
      await this.myCopies.replaceSavedCopyFromPublished({
        practitionerId,
        routineId: validatedRoutineId,
        sourceRoutineVersionId: head.routine_version_id,
        sourceVersionNumber: head.version_number,
        rows: sourceRows.map((row) => ({
          id: crypto.randomUUID(),
          position: row.position,
          exerciseId: row.exercise_id,
          exerciseVersionId: row.exercise_version_id,
          prescriptionType: row.prescription_type,
          params: parseExerciseParamsJson(row.params_json),
        })),
      });
    } catch (err) {
      mapRoutineRepositoryError(err);
    }
    return { undo, adopted_version: head.version_number };
  }

  async keepMyCopyVersion(
    practitionerId: string,
    routineId: string,
  ): Promise<{ undo: RoutineMutationUndo }> {
    await this.requirePractitioner(practitionerId);
    const validatedRoutineId = validateOpaqueEntityId(routineId, "Routine id");
    const existing = await this.myCopies.findForPractitioner(
      practitionerId,
      validatedRoutineId,
    );
    if (!existing) {
      throw new RoutinesLibraryServiceError(
        "Saved routine copy not found",
        "my_routine_not_found",
      );
    }
    return { undo: await this.captureUndoSnapshot(practitionerId, validatedRoutineId) };
  }

  async updateMyCopy(input: {
    practitionerId: string;
    routineId: string;
    rows: {
      position: number;
      exerciseId: string;
      exerciseVersionId: string;
      prescriptionType: RoutineExerciseRow["prescription_type"];
      params: RoutineExerciseRow["params"];
    }[];
  }): Promise<{ undo: RoutineMutationUndo }> {
    await this.requirePractitioner(input.practitionerId);
    const validatedRoutineId = validateOpaqueEntityId(input.routineId, "Routine id");
    const copy = await this.myCopies.findForPractitioner(
      input.practitionerId,
      validatedRoutineId,
    );
    if (!copy) {
      throw new RoutinesLibraryServiceError(
        "Saved routine copy not found",
        "my_routine_not_found",
      );
    }
    const undo = await this.captureUndoSnapshot(
      input.practitionerId,
      validatedRoutineId,
    );
    try {
      await this.myCopies.replaceMyCopyRows({
        practitionerId: input.practitionerId,
        routineId: validatedRoutineId,
        rows: input.rows.map((row) => ({
          id: crypto.randomUUID(),
          position: row.position,
          exerciseId: row.exerciseId,
          exerciseVersionId: row.exerciseVersionId,
          prescriptionType: row.prescriptionType,
          params: row.params,
        })),
      });
    } catch (err) {
      mapRoutineRepositoryError(err);
    }
    return { undo };
  }

  async applyUndo(
    urlPractitionerId: string,
    urlRoutineId: string,
    snapshot: RoutineMutationUndo,
  ): Promise<void> {
    const validated = parseRoutineMutationUndo(snapshot);
    if (
      validated.practitioner_id !== urlPractitionerId ||
      validated.routine_id !== urlRoutineId
    ) {
      throw new RoutinesLibraryServiceError(
        "Undo snapshot does not match URL",
        "undo_mismatch",
      );
    }
    await this.requirePractitioner(urlPractitionerId);
    const snap = validated.snapshot;
    const existing = await this.myCopies.findForPractitioner(
      urlPractitionerId,
      urlRoutineId,
    );

    if (!snap.had_copy) {
      if (existing) {
        try {
          await this.myCopies.deleteCopy(urlPractitionerId, urlRoutineId);
        } catch (err) {
          mapRoutineRepositoryError(err);
        }
      }
      return;
    }

    if (!snap.copy) {
      throw new RoutinesLibraryServiceError(
        "Undo copy snapshot missing",
        "invalid_input",
      );
    }

    try {
      await this.myCopies.restoreSavedCopyFromSnapshot({
        practitionerId: urlPractitionerId,
        routineId: urlRoutineId,
        snapshot: {
          id: snap.copy.id,
          source_routine_version_id: snap.copy.source_routine_version_id,
          source_version_number: snap.copy.source_version_number,
          saved_at: snap.copy.saved_at,
          last_used_at: snap.copy.last_used_at,
          edited: snap.copy.edited,
          rows: snap.copy.rows.map((row) => ({
            position: row.position,
            exercise_id: row.exercise_id,
            exercise_version_id: row.exercise_version_id,
            prescription_type: row.prescription_type,
            params_json: row.params_json,
          })),
        },
      });
    } catch (err) {
      mapRoutineRepositoryError(err);
    }
  }

  private async bodyRegionLabel(bodyRegionId: string): Promise<string> {
    const row = await this.sql.first<{ label: string }>(
      `SELECT label FROM body_regions WHERE id = ? LIMIT 1`,
      [bodyRegionId],
    );
    return row?.label ?? bodyRegionId;
  }

  private async buildCommunityRows(versionId: string): Promise<RoutineExerciseRow[]> {
    const rows = await this.versionRows.listForVersion(versionId);
    return this.mapRowsWithTitles(
      rows,
      (row) => row.exercise_id,
      (row) => ({
        position: row.position,
        exercise_id: row.exercise_id,
        exercise_version_id: row.exercise_version_id,
        prescription_type: row.prescription_type,
        params_json: row.params_json,
      }),
    );
  }

  private async buildMyCopyRows(
    practitionerRoutineId: string,
  ): Promise<RoutineExerciseRow[]> {
    const rows = await this.myCopyRows.listForCopy(practitionerRoutineId);
    return this.mapRowsWithTitles(
      rows,
      (row) => row.exercise_id,
      (row) => ({
        position: row.position,
        exercise_id: row.exercise_id,
        exercise_version_id: row.exercise_version_id,
        prescription_type: row.prescription_type,
        params_json: row.params_json,
      }),
    );
  }

  private async mapRowsWithTitles<
    T extends {
      position: number;
      exercise_id: string;
      exercise_version_id: string;
      prescription_type: RoutineExerciseRow["prescription_type"];
      params_json: string;
    },
  >(
    rows: T[],
    exerciseId: (row: T) => string,
    pick: (row: T) => {
      position: number;
      exercise_id: string;
      exercise_version_id: string;
      prescription_type: RoutineExerciseRow["prescription_type"];
      params_json: string;
    },
  ): Promise<RoutineExerciseRow[]> {
    const items: RoutineExerciseRow[] = [];
    for (const row of rows) {
      const core = pick(row);
      const version = await this.exerciseRead.getApprovedVersionById(
        core.exercise_version_id,
      );
      const title =
        version?.title ??
        (await this.exerciseRead.getLatestApprovedByExerciseId(exerciseId(row)))
          ?.title ??
        "Exercise";
      items.push({
        position: core.position,
        exercise_id: core.exercise_id,
        exercise_version_id: core.exercise_version_id,
        exercise_name: title,
        prescription_type: core.prescription_type,
        params: parseExerciseParamsJson(core.params_json),
      });
    }
    return items;
  }

  private async requirePractitioner(practitionerId: string): Promise<void> {
    try {
      await requirePractitionerRecord(this.practitioners, practitionerId);
    } catch (err) {
      if (err instanceof PractitionerNotFoundError) {
        throw new RoutinesLibraryServiceError(
          "Practitioner not found",
          "practitioner_not_found",
        );
      }
      throw err;
    }
  }

  private async captureUndoSnapshot(
    practitionerId: string,
    routineId: string,
  ): Promise<RoutineMutationUndo> {
    const existing = await this.myCopies.findForPractitioner(practitionerId, routineId);
    const snapshot: RoutineUndoSnapshot = existing
      ? {
          had_copy: true,
          copy: await this.copyToUndoSnapshot(existing),
        }
      : { had_copy: false, copy: null };
    return { practitioner_id: practitionerId, routine_id: routineId, snapshot };
  }

  private async copyToUndoSnapshot(
    copy: PractitionerRoutineRecord,
  ): Promise<RoutineUndoCopySnapshot> {
    const rows = await this.myCopyRows.listForCopy(copy.id);
    return {
      id: copy.id,
      source_routine_version_id: copy.source_routine_version_id,
      source_version_number: copy.source_version_number,
      saved_at: copy.saved_at,
      last_used_at: copy.last_used_at,
      edited: copy.edited,
      rows: rows.map((row) => ({
        position: row.position,
        exercise_id: row.exercise_id,
        exercise_version_id: row.exercise_version_id,
        prescription_type: row.prescription_type,
        params_json: row.params_json,
      })),
    };
  }
}
