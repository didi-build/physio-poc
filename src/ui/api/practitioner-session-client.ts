import { PRACTITIONER_SESSION_API_PATH } from "../../practitioner-session-api-paths.js";
import type { PractitionerSessionView } from "../../services/practitioner-session/types.js";

export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type PractitionerSessionClientOptions = {
  fetchFn?: FetchFn;
};

async function readJson<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const body = (await response.json().catch(() => ({}))) as { message?: string };
    throw new Error(body.message ?? `Request failed (${response.status})`);
  }
  return (await response.json()) as T;
}

export class PractitionerSessionClient {
  private readonly fetchFn: FetchFn;

  constructor(options: PractitionerSessionClientOptions = {}) {
    this.fetchFn = options.fetchFn ?? globalThis.fetch.bind(globalThis);
  }

  getSession(): Promise<PractitionerSessionView> {
    return this.fetchFn(PRACTITIONER_SESSION_API_PATH, {
      method: "GET",
      credentials: "include",
    }).then((response) => readJson<PractitionerSessionView>(response));
  }
}

let defaultClient: PractitionerSessionClient | null = null;

export function getPractitionerSessionClient(): PractitionerSessionClient {
  defaultClient ??= new PractitionerSessionClient();
  return defaultClient;
}

export function setPractitionerSessionClientForTests(
  client: PractitionerSessionClient | null,
): void {
  defaultClient = client;
}
