import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { createBoundedCimdMetadataFetch } from "../node/bounded-cimd-metadata-fetch.js";

const workerFetchClientMetadataResource: ClientMetadataResourceFetch = async (
  input,
  init,
) => {
  const request = new Request(input, init);
  if (request.method !== "GET" && request.method !== "HEAD") {
    throw new TypeError("CIMD Worker transport supports only GET and HEAD");
  }
  if (new URL(request.url).protocol !== "https:") {
    throw new TypeError("CIMD Worker transport requires an HTTPS URL");
  }
  return fetch(request, {
    ...init,
    redirect: "manual",
    signal: init?.signal ?? request.signal,
  });
};

/** Workers CIMD fetch with response size and time limits (DIDI-1043). */
export const workerCimdMetadataFetch = createBoundedCimdMetadataFetch(
  workerFetchClientMetadataResource,
);
