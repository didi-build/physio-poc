import type { TextOverrideKey } from "../../domain/exercise-text-overrides.js";
import type {
  ExerciseDetailsResult,
  ExerciseMutationUndo,
  ExerciseSearchSort,
  MyExercisesListResult,
  SearchApprovedExercisesResult,
} from "../../services/exercise-library/types.js";
import { type ReadRequestOptions, readGetInit } from "./read-request-options.js";
import {
  EXERCISE_LIBRARY_APPROVED_SEARCH_PATH,
  EXERCISE_LIBRARY_MY_EXERCISES_PATH,
  exerciseLibraryExerciseDetailsPath,
  exerciseLibraryMyExerciseItemPath,
} from "../../exercise-library-api-paths.js";

/** Dev fixture id for exercise-request UI ownership labels until full session UI (DIDI-1009). */
export const DEV_PRACTITIONER_ID = "00000000-0000-4000-8000-000000000001";

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ExerciseLibraryClientOptions = {
  fetchFn?: FetchFn;
};

export type ApprovedSearchParams = {
  q?: string;
  category?: "Stretching" | "Strengthening";
  body_region?: string;
  sort?: ExerciseSearchSort;
  cursor?: string;
  limit?: number;
};

export type MyExercisesListParams = {
  q?: string;
  category?: "Stretching" | "Strengthening";
  body_region?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
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

/**
 * Single entry point for exercise library HTTP from the web UI.
 * All request paths and JSON bodies are built here (DIDI-1059).
 */
export class ExerciseLibraryClient {
  private readonly fetchFn: FetchFn;

  constructor(options: ExerciseLibraryClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  searchApproved(
    params: ApprovedSearchParams,
    options?: ReadRequestOptions,
  ): Promise<SearchApprovedExercisesResult> {
    const path = buildSearchUrl(EXERCISE_LIBRARY_APPROVED_SEARCH_PATH, {
      q: params.q,
      category: params.category,
      body_region: params.body_region,
      sort: params.sort,
      cursor: params.cursor,
      limit: params.limit !== undefined ? String(params.limit) : undefined,
    });
    return this.fetchFn(path, readGetInit(options)).then((response) =>
      readJson<SearchApprovedExercisesResult>(response),
    );
  }

  listMyExercises(
    params: MyExercisesListParams = {},
    options?: ReadRequestOptions,
  ): Promise<MyExercisesListResult> {
    const path = buildSearchUrl(EXERCISE_LIBRARY_MY_EXERCISES_PATH, {
      q: params.q,
      category: params.category,
      body_region: params.body_region,
    });
    return this.fetchFn(path, readGetInit(options)).then((response) =>
      readJson<MyExercisesListResult>(response),
    );
  }

  getExerciseDetails(
    exerciseId: string,
    options?: ReadRequestOptions,
  ): Promise<ExerciseDetailsResult> {
    return this.fetchFn(
      exerciseLibraryExerciseDetailsPath(exerciseId),
      readGetInit(options),
    ).then((response) => readJson<ExerciseDetailsResult>(response));
  }

  saveToMyExercises(exerciseId: string): Promise<{ undo: ExerciseMutationUndo }> {
    return this.fetchFn(exerciseLibraryMyExerciseItemPath(exerciseId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "save" }),
    }).then((response) => readJson<{ undo: ExerciseMutationUndo }>(response));
  }

  setPinned(
    exerciseId: string,
    pinned: boolean,
  ): Promise<{ undo: ExerciseMutationUndo }> {
    return this.fetchFn(exerciseLibraryMyExerciseItemPath(exerciseId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "pin", pinned }),
    }).then((response) => readJson<{ undo: ExerciseMutationUndo }>(response));
  }

  removeFromMyExercises(exerciseId: string): Promise<{ undo: ExerciseMutationUndo }> {
    return this.fetchFn(exerciseLibraryMyExerciseItemPath(exerciseId), {
      method: "DELETE",
      headers: { "content-type": "application/json" },
    }).then((response) => readJson<{ undo: ExerciseMutationUndo }>(response));
  }

  applyUndo(exerciseId: string, undo: ExerciseMutationUndo): Promise<{ ok: true }> {
    return this.fetchFn(exerciseLibraryMyExerciseItemPath(exerciseId), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "undo", undo }),
    }).then((response) => readJson<{ ok: true }>(response));
  }

  updateMyCopy(
    exerciseId: string,
    body: {
      text_overrides?: Partial<Record<TextOverrideKey, string>>;
      use_library_version?: TextOverrideKey[];
      keep_mine?: TextOverrideKey[];
    },
  ): Promise<ExerciseDetailsResult> {
    return this.fetchFn(exerciseLibraryMyExerciseItemPath(exerciseId), {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).then((response) => readJson<ExerciseDetailsResult>(response));
  }
}

let defaultClient: ExerciseLibraryClient | null = null;

export function getExerciseLibraryClient(): ExerciseLibraryClient {
  defaultClient ??= new ExerciseLibraryClient();
  return defaultClient;
}

/** Tests inject a client; resets the lazy singleton when called with a client. */
export function setExerciseLibraryClientForTests(
  client: ExerciseLibraryClient | null,
): void {
  defaultClient = client;
}
