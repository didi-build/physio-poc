import type { RegenerationQuota } from "../../services/exercise-media/exercise-media-service.js";
import type { MediaRegenerationScope } from "../../storage/repositories/exercise-media.js";
import { DEV_PRACTITIONER_ID } from "./exercise-library-client.js";

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type ExerciseMediaClientOptions = {
  fetchFn?: FetchFn;
  practitionerId?: string;
};

const JSON_HEADERS = { "content-type": "application/json" };

function practitionerBase(practitionerId: string): string {
  return `/api/practitioners/${encodeURIComponent(practitionerId)}`;
}

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
  private readonly practitionerId: string;
  private readonly fetchFn: FetchFn;

  constructor(options: ExerciseMediaClientOptions = {}) {
    this.practitionerId = options.practitionerId ?? DEV_PRACTITIONER_ID;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getRegenerationQuota(): Promise<RegenerationQuota> {
    const path = `${practitionerBase(this.practitionerId)}/media-regeneration-quota`;
    return this.fetchFn(path, { method: "GET" }).then((response) =>
      readJson<RegenerationQuota>(response),
    );
  }

  regenerateDraftMedia(input: {
    exerciseVersionId: string;
    scope: MediaRegenerationScope;
    note?: string | null;
  }): Promise<unknown> {
    const path = `${practitionerBase(this.practitionerId)}/exercise-versions/${encodeURIComponent(input.exerciseVersionId)}/media/regenerate`;
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
