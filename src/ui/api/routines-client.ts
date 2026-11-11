import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import {
  ROUTINES_AUTHORING_COLLECTION_PATH,
  routineAuthoringItemPath,
  routineVersionHistoryPath,
} from "../../routine-authoring-api-paths.js";
import type {
  BodyRegionListItem,
  MyRoutinesListResult,
  PublishValidationIssue,
  RoutineDetailsResult,
  RoutineDraftDiscardUndo,
  RoutineMutationUndo,
  RoutineSearchSort,
  RoutineVersionHistoryResult,
  SearchCommunityRoutinesResult,
} from "../../services/routines/types.js";
import type { RoutineExerciseRow } from "../../services/routines/types.js";
import { type ReadRequestOptions, readGetInit } from "./read-request-options.js";
import {
  BODY_REGIONS_LIST_PATH,
  ROUTINES_COMMUNITY_SEARCH_PATH,
  ROUTINES_MY_ROUTINES_PATH,
  routineDetailsPath,
  routineMyCopyPath,
} from "../../routine-library-api-paths.js";

export type RoutineAuthoringRowInput = {
  position: number;
  exercise_id: string;
  exercise_version_id: string;
  prescription_type: PrescriptionType;
  params: ExerciseParams;
};

export type RoutineDraftAutosaveInput = {
  body_region_id?: string;
  condition_id?: string | null;
  who_its_for?: string | null;
  name?: string | null;
  rows?: RoutineAuthoringRowInput[];
};

export class RoutinesAuthoringError extends Error {
  constructor(
    message: string,
    readonly code: string,
    readonly validationIssues?: PublishValidationIssue[],
  ) {
    super(message);
    this.name = "RoutinesAuthoringError";
  }
}

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type RoutinesClientOptions = {
  fetchFn?: FetchFn;
};

export type CommunitySearchParams = {
  q?: string;
  body_region?: string;
  condition_id?: string;
  sort?: RoutineSearchSort;
  cursor?: string;
  limit?: number;
};

export type MyRoutinesListParams = {
  q?: string;
  body_region?: string;
  condition_id?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      message?: string;
      error?: string;
      validation_issues?: PublishValidationIssue[];
    };
    if (body.error === "publish_validation_failed") {
      throw new RoutinesAuthoringError(
        body.message ?? "Publish validation failed",
        body.error,
        body.validation_issues,
      );
    }
    if (body.error) {
      throw new RoutinesAuthoringError(
        body.message ?? `Request failed (${response.status})`,
        body.error,
      );
    }
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function mapRoutineRowsForApi(rows: RoutineExerciseRow[]): RoutineAuthoringRowInput[] {
  return rows.map((row) => ({
    position: row.position,
    exercise_id: row.exercise_id,
    exercise_version_id: row.exercise_version_id,
    prescription_type: row.prescription_type,
    params: row.params,
  }));
}

function buildSearchUrl(
  path: string,
  params: Record<string, string | undefined>,
): string {
  const url = new URL(path, "http://local");
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "") {
      url.searchParams.set(key, value);
    }
  }
  return url.pathname + url.search;
}

export class RoutinesClient {
  private readonly fetchFn: FetchFn;

  constructor(options: RoutinesClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  searchCommunity(
    params: CommunitySearchParams,
    options?: ReadRequestOptions,
  ): Promise<SearchCommunityRoutinesResult> {
    const path = buildSearchUrl(ROUTINES_COMMUNITY_SEARCH_PATH, {
      q: params.q,
      body_region: params.body_region,
      condition_id: params.condition_id,
      sort: params.sort,
      cursor: params.cursor,
      limit: params.limit !== undefined ? String(params.limit) : undefined,
    });
    return this.fetchFn(path, readGetInit(options)).then((response) =>
      readJson<SearchCommunityRoutinesResult>(response),
    );
  }

  listMyRoutines(
    params: MyRoutinesListParams = {},
    options?: ReadRequestOptions,
  ): Promise<MyRoutinesListResult> {
    const path = buildSearchUrl(ROUTINES_MY_ROUTINES_PATH, {
      q: params.q,
      body_region: params.body_region,
      condition_id: params.condition_id,
    });
    return this.fetchFn(path, readGetInit(options)).then((response) =>
      readJson<MyRoutinesListResult>(response),
    );
  }

  getRoutineDetails(
    routineId: string,
    options?: ReadRequestOptions,
  ): Promise<RoutineDetailsResult> {
    return this.fetchFn(routineDetailsPath(routineId), readGetInit(options)).then(
      (response) => readJson<RoutineDetailsResult>(response),
    );
  }

  listMeBodyRegions(options?: ReadRequestOptions): Promise<BodyRegionListItem[]> {
    return this.fetchFn(BODY_REGIONS_LIST_PATH, readGetInit(options)).then((response) =>
      readJson<BodyRegionListItem[]>(response),
    );
  }

  saveToMyRoutines(routineId: string): Promise<{ undo: RoutineMutationUndo }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save" }),
    }).then((response) => readJson<{ undo: RoutineMutationUndo }>(response));
  }

  removeFromMyRoutines(routineId: string): Promise<{ undo: RoutineMutationUndo }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    }).then((response) => readJson<{ undo: RoutineMutationUndo }>(response));
  }

  adoptCommunityVersion(
    routineId: string,
  ): Promise<{ undo: RoutineMutationUndo; adopted_version: number }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "adopt_community_version" }),
    }).then((response) =>
      readJson<{ undo: RoutineMutationUndo; adopted_version: number }>(response),
    );
  }

  keepMyCopyVersion(routineId: string): Promise<{ undo: RoutineMutationUndo }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "keep_my_copy" }),
    }).then((response) => readJson<{ undo: RoutineMutationUndo }>(response));
  }

  applyUndo(routineId: string, undo: RoutineMutationUndo): Promise<{ ok: true }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "undo", undo }),
    }).then((response) => readJson<{ ok: true }>(response));
  }

  updateMyCopy(
    routineId: string,
    rows: RoutineExerciseRow[],
  ): Promise<{ undo: RoutineMutationUndo }> {
    return this.fetchFn(routineMyCopyPath(routineId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rows: mapRoutineRowsForApi(rows),
      }),
    }).then((response) => readJson<{ undo: RoutineMutationUndo }>(response));
  }

  createRoutineDraft(input: {
    body_region_id: string;
    condition_id?: string | null;
    who_its_for?: string | null;
    name?: string | null;
  }): Promise<{
    routine_id: string;
    draft_version_id: string;
    draft_updated_at: string;
  }> {
    return this.fetchFn(ROUTINES_AUTHORING_COLLECTION_PATH, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    }).then((response) =>
      readJson<{
        routine_id: string;
        draft_version_id: string;
        draft_updated_at: string;
      }>(response),
    );
  }

  autosaveRoutineDraft(
    routineId: string,
    patch: RoutineDraftAutosaveInput,
  ): Promise<{ routine_id: string; draft_updated_at: string }> {
    return this.fetchFn(routineAuthoringItemPath(routineId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(patch),
    }).then((response) =>
      readJson<{ routine_id: string; draft_updated_at: string }>(response),
    );
  }

  cancelUntouchedRoutineDraft(routineId: string): Promise<{ ok: true }> {
    return this.fetchFn(routineAuthoringItemPath(routineId), {
      method: "DELETE",
    }).then((response) => readJson<{ ok: true }>(response));
  }

  publishRoutineDraft(
    routineId: string,
    input: { name?: string } = {},
  ): Promise<{
    routine_id: string;
    version_number: number;
    routine_version_id: string;
  }> {
    return this.fetchFn(routineAuthoringItemPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "publish", ...input }),
    }).then((response) =>
      readJson<{
        routine_id: string;
        version_number: number;
        routine_version_id: string;
      }>(response),
    );
  }

  discardRoutineDraft(routineId: string): Promise<{ undo: RoutineDraftDiscardUndo }> {
    return this.fetchFn(routineAuthoringItemPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "discard_draft" }),
    }).then((response) => readJson<{ undo: RoutineDraftDiscardUndo }>(response));
  }

  undoRoutineDraftDiscard(
    routineId: string,
    undo: RoutineDraftDiscardUndo,
  ): Promise<{ ok: true }> {
    return this.fetchFn(routineAuthoringItemPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "undo_draft_discard", undo }),
    }).then((response) => readJson<{ ok: true }>(response));
  }

  saveRoutineCommunityVersion(
    routineId: string,
    input: {
      expected_published_version: number;
      name: string;
      change_summary?: string | null;
      rows: RoutineExerciseRow[];
      condition_id?: string | null;
      body_region_id?: string;
      who_its_for?: string | null;
    },
  ): Promise<{
    routine_id: string;
    version_number: number;
    routine_version_id: string;
  }> {
    return this.fetchFn(routineAuthoringItemPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "save_community_version",
        expected_published_version: input.expected_published_version,
        name: input.name,
        change_summary: input.change_summary,
        rows: mapRoutineRowsForApi(input.rows),
        condition_id: input.condition_id,
        body_region_id: input.body_region_id,
        who_its_for: input.who_its_for,
      }),
    }).then((response) =>
      readJson<{
        routine_id: string;
        version_number: number;
        routine_version_id: string;
      }>(response),
    );
  }

  restoreRoutineVersion(
    routineId: string,
    restoreFromVersionNumber: number,
  ): Promise<{
    routine_id: string;
    restored_from_version_number: number;
    version_number: number;
    routine_version_id: string;
  }> {
    return this.fetchFn(routineAuthoringItemPath(routineId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        action: "restore_version",
        restore_from_version_number: restoreFromVersionNumber,
      }),
    }).then((response) =>
      readJson<{
        routine_id: string;
        restored_from_version_number: number;
        version_number: number;
        routine_version_id: string;
      }>(response),
    );
  }

  getRoutineVersionHistory(
    routineId: string,
    options?: ReadRequestOptions,
  ): Promise<RoutineVersionHistoryResult> {
    return this.fetchFn(
      routineVersionHistoryPath(routineId),
      readGetInit(options),
    ).then((response) => readJson<RoutineVersionHistoryResult>(response));
  }
}

let defaultClient: RoutinesClient | null = null;

export function getRoutinesClient(): RoutinesClient {
  defaultClient ??= new RoutinesClient();
  return defaultClient;
}

export function setRoutinesClientForTests(client: RoutinesClient | null): void {
  defaultClient = client;
}
