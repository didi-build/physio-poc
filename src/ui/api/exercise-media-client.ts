import { type ReadRequestOptions, readGetInit } from "./read-request-options.js";
import type { RegenerationQuota } from "../../services/exercise-media/exercise-media-service.js";
import type { MediaRegenerationScope } from "../../storage/repositories/exercise-media.js";
import {
  EXERCISE_MEDIA_REGENERATION_QUOTA_PATH,
  exerciseMediaDraftStillPath,
  exerciseMediaRegeneratePath,
} from "../../exercise-media-api-paths.js";

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ExerciseMediaClientOptions = {
  fetchFn?: FetchFn;
};

const JSON_HEADERS = { "content-type": "application/json" };

export type ExerciseMediaClientError = {
  status: number;
  error?: string;
  message?: string;
};

export class ExerciseMediaRequestError extends Error {
  constructor(
    message: string,
    readonly detail: ExerciseMediaClientError,
  ) {
    super(message);
    this.name = "ExerciseMediaRequestError";
  }
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as {
      error?: string;
      message?: string;
    };
    throw new ExerciseMediaRequestError(
      body.message ?? `Request failed (${response.status})`,
      { status: response.status, error: body.error, message: body.message },
    );
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

export class ExerciseMediaClient {
  private readonly fetchFn: FetchFn;

  constructor(options: ExerciseMediaClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getRegenerationQuota(options?: ReadRequestOptions): Promise<RegenerationQuota> {
    return this.fetchFn(
      EXERCISE_MEDIA_REGENERATION_QUOTA_PATH,
      readGetInit(options),
    ).then((response) => readJson<RegenerationQuota>(response));
  }

  regenerateDraftMedia(input: {
    exerciseVersionId: string;
    scope: MediaRegenerationScope;
    note?: string | null;
  }): Promise<unknown> {
    const path = exerciseMediaRegeneratePath(input.exerciseVersionId);
    return this.fetchFn(
      path,
      mutatingInit(path, {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ scope: input.scope, note: input.note ?? null }),
      }),
    ).then((response) => readJson(response));
  }

  draftStillObjectUrl(
    exerciseVersionId: string,
    which: "start" | "end",
    options?: ReadRequestOptions,
  ): Promise<string | null> {
    const path = exerciseMediaDraftStillPath(exerciseVersionId, which);
    return this.fetchFn(path, readGetInit(options)).then(async (response) => {
      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as {
          error?: string;
          message?: string;
        };
        throw new ExerciseMediaRequestError(
          body.message ?? `Request failed (${response.status})`,
          { status: response.status, error: body.error, message: body.message },
        );
      }
      const blob = await response.blob();
      return URL.createObjectURL(blob);
    });
  }
}

let defaultClient: ExerciseMediaClient | null = null;

export function getExerciseMediaClient(): ExerciseMediaClient {
  defaultClient ??= new ExerciseMediaClient();
  return defaultClient;
}

export function setExerciseMediaClientForTests(
  client: ExerciseMediaClient | null,
): void {
  defaultClient = client;
}
