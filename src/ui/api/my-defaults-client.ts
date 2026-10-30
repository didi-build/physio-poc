import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import type {
  MyDefaultsExerciseTypeView,
  MyDefaultsPageView,
  ShareLinkExpiryDefaultsView,
} from "../../services/my-defaults/types.js";
import {
  MY_DEFAULTS_API_BASE,
  myDefaultsShareLinkExpiryPath,
  myDefaultsTypePath,
} from "../../my-defaults-api-paths.js";
import { mutatingAppApiRequestInitForRelativePath } from "./mutating-app-api-request.js";

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type MyDefaultsClientOptions = {
  fetchFn?: FetchFn;
  /** Test override for mutating request Origin resolution. */
  requestOrigin?: string;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export class MyDefaultsClient {
  private readonly fetchFn: FetchFn;
  private readonly requestOrigin: string;

  constructor(options: MyDefaultsClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
    this.requestOrigin =
      options.requestOrigin ??
      (typeof globalThis.location !== "undefined"
        ? globalThis.location.origin
        : "http://127.0.0.1");
  }

  private mutatingInit(path: string, init: RequestInit): RequestInit {
    return mutatingAppApiRequestInitForRelativePath(path, init, this.requestOrigin);
  }

  getPage(): Promise<MyDefaultsPageView> {
    return this.fetchFn(MY_DEFAULTS_API_BASE, { method: "GET" }).then((response) =>
      readJson<MyDefaultsPageView>(response),
    );
  }

  updateShareLinkExpiry(
    expiresIn: ShareLinkExpiresIn,
  ): Promise<ShareLinkExpiryDefaultsView> {
    const path = myDefaultsShareLinkExpiryPath();
    return this.fetchFn(
      path,
      this.mutatingInit(path, {
        method: "PATCH",
        body: JSON.stringify({ expires_in: expiresIn }),
      }),
    ).then((response) => readJson<ShareLinkExpiryDefaultsView>(response));
  }

  upsertTypeDefault(
    type: PrescriptionType,
    params: ExerciseParams,
  ): Promise<MyDefaultsExerciseTypeView> {
    const path = myDefaultsTypePath(type);
    return this.fetchFn(
      path,
      this.mutatingInit(path, {
        method: "PUT",
        body: JSON.stringify({ params }),
      }),
    ).then((response) => readJson<MyDefaultsExerciseTypeView>(response));
  }

  resetTypeDefault(type: PrescriptionType): Promise<MyDefaultsExerciseTypeView> {
    const path = myDefaultsTypePath(type);
    return this.fetchFn(
      path,
      this.mutatingInit(path, {
        method: "DELETE",
        body: "{}",
      }),
    ).then((response) => readJson<MyDefaultsExerciseTypeView>(response));
  }
}

let defaultClient: MyDefaultsClient | null = null;

export function getMyDefaultsClient(): MyDefaultsClient {
  defaultClient ??= new MyDefaultsClient();
  return defaultClient;
}

export function setMyDefaultsClientForTests(client: MyDefaultsClient | null): void {
  defaultClient = client;
}
