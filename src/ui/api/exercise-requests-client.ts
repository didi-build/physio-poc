import {
  EXERCISE_REQUESTS_API_BASE,
  exerciseRequestApprovePath,
  exerciseRequestDraftPath,
  exerciseRequestPath,
  exerciseRequestsCollectionPath,
  exerciseRequestsInProgressCountPath,
  exerciseRequestsInProgressPath,
} from "../../exercise-requests-api-paths.js";
import { type ReadRequestOptions, readGetInit } from "./read-request-options.js";
import type {
  ApproveExerciseRequestResult,
  DraftFieldPatch,
  ExerciseRequestDraftView,
  InProgressRequestsResult,
  SimilarExercisesResult,
  SubmitExerciseRequestResult,
  SubmitResolution,
} from "../../services/exercise-requests/types.js";

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ExerciseRequestsClientOptions = {
  fetchFn?: FetchFn;
};

const JSON_HEADERS = { "content-type": "application/json" };

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

function mutatingInit(url: string, init: RequestInit): RequestInit {
  const headers = new Headers(init.headers);
  if (!headers.has("origin")) {
    headers.set("origin", new URL(url, "http://local").origin);
  }
  if (!headers.has("content-type") && init.body) {
    headers.set("content-type", "application/json");
  }
  return { ...init, headers };
}

export class ExerciseRequestsClient {
  private readonly fetchFn: FetchFn;

  constructor(options: ExerciseRequestsClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  listSimilar(
    query: string,
    options?: ReadRequestOptions,
  ): Promise<SimilarExercisesResult> {
    const path = `${EXERCISE_REQUESTS_API_BASE}/similar?q=${encodeURIComponent(query)}`;
    return this.fetchFn(path, readGetInit(options)).then((response) =>
      readJson<SimilarExercisesResult>(response),
    );
  }

  listInProgress(options?: ReadRequestOptions): Promise<InProgressRequestsResult> {
    return this.fetchFn(exerciseRequestsInProgressPath(), readGetInit(options)).then(
      (response) => readJson<InProgressRequestsResult>(response),
    );
  }

  getInProgressCount(
    options?: ReadRequestOptions,
  ): Promise<{ in_progress_count: number }> {
    return this.fetchFn(
      exerciseRequestsInProgressCountPath(),
      readGetInit(options),
    ).then((response) => readJson<{ in_progress_count: number }>(response));
  }

  submitRequest(input: {
    requested_name: string;
    exercise_note?: string | null;
    form_opened_at: string;
    resolution?: SubmitResolution;
    conflict_request_id?: string;
  }): Promise<SubmitExerciseRequestResult> {
    const url = exerciseRequestsCollectionPath();
    return this.fetchFn(
      url,
      mutatingInit(url, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify(input),
      }),
    ).then((response) => readJson<SubmitExerciseRequestResult>(response));
  }

  getRequest(
    requestId: string,
    options?: ReadRequestOptions,
  ): Promise<ExerciseRequestDraftView> {
    return this.fetchFn(exerciseRequestPath(requestId), readGetInit(options)).then(
      (response) => readJson<ExerciseRequestDraftView>(response),
    );
  }

  updateDraft(
    requestId: string,
    patch: DraftFieldPatch,
  ): Promise<ExerciseRequestDraftView> {
    const url = exerciseRequestDraftPath(requestId);
    return this.fetchFn(
      url,
      mutatingInit(url, {
        method: "PATCH",
        headers: JSON_HEADERS,
        body: JSON.stringify(patch),
      }),
    ).then((response) => readJson<ExerciseRequestDraftView>(response));
  }

  approveRequest(requestId: string): Promise<ApproveExerciseRequestResult> {
    const url = exerciseRequestApprovePath(requestId);
    return this.fetchFn(
      url,
      mutatingInit(url, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({}),
      }),
    ).then((response) => readJson<ApproveExerciseRequestResult>(response));
  }
}

let defaultClient: ExerciseRequestsClient | null = null;

export function getExerciseRequestsClient(): ExerciseRequestsClient {
  defaultClient ??= new ExerciseRequestsClient();
  return defaultClient;
}

export function setExerciseRequestsClientForTests(
  client: ExerciseRequestsClient | null,
): void {
  defaultClient = client;
}
