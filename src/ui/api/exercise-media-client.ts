import { type ReadRequestOptions, readGetInit } from "./read-request-options.js";
import type { RegenerationQuota } from "../../services/exercise-media/exercise-media-service.js";
import type { MediaRegenerationScope } from "../../storage/repositories/exercise-media.js";
import {
  EXERCISE_MEDIA_REGENERATION_QUOTA_PATH,
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
