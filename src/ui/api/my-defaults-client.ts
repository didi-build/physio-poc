import type { ExerciseParams } from "../../domain/exercise-params.js";
import type { PrescriptionType } from "../../domain/exercise-types.js";
import type { ShareLinkExpiresIn } from "../../mcp-connector/share-link-expiry.js";
import type {
  MyDefaultsExerciseTypeView,
  MyDefaultsPageView,
  ShareLinkExpiryDefaultsView,
} from "../../services/my-defaults/types.js";

/** Until DIDI-1059; bound to session on the server. */
const DEV_PRACTITIONER_ID = "00000000-0000-4000-8000-000000000001";

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type MyDefaultsClientOptions = {
  fetchFn?: FetchFn;
  practitionerId?: string;
};

function practitionerBase(practitionerId: string): string {
  return `/api/practitioners/${encodeURIComponent(practitionerId)}/my-defaults`;
}

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export class MyDefaultsClient {
  private readonly practitionerId: string;
  private readonly fetchFn: FetchFn;

  constructor(options: MyDefaultsClientOptions = {}) {
    this.practitionerId = options.practitionerId ?? DEV_PRACTITIONER_ID;
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getPage(): Promise<MyDefaultsPageView> {
    return this.fetchFn(practitionerBase(this.practitionerId), { method: "GET" }).then(
      (response) => readJson<MyDefaultsPageView>(response),
    );
  }

  updateShareLinkExpiry(
    expiresIn: ShareLinkExpiresIn,
  ): Promise<ShareLinkExpiryDefaultsView> {
    return this.fetchFn(`${practitionerBase(this.practitionerId)}/share-link-expiry`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ expires_in: expiresIn }),
    }).then((response) => readJson<ShareLinkExpiryDefaultsView>(response));
  }

  upsertTypeDefault(
    type: PrescriptionType,
    params: ExerciseParams,
  ): Promise<MyDefaultsExerciseTypeView> {
    return this.fetchFn(`${practitionerBase(this.practitionerId)}/types/${type}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ params }),
    }).then((response) => readJson<MyDefaultsExerciseTypeView>(response));
  }

  resetTypeDefault(type: PrescriptionType): Promise<MyDefaultsExerciseTypeView> {
    return this.fetchFn(`${practitionerBase(this.practitionerId)}/types/${type}`, {
      method: "DELETE",
    }).then((response) => readJson<MyDefaultsExerciseTypeView>(response));
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
