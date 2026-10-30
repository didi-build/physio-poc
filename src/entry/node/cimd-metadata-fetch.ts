import { fetchClientMetadataResource as fetchNodeCimdMetadataResource } from "@better-auth/cimd/node";
import { createBoundedCimdMetadataFetch } from "../../adapters/node/bounded-cimd-metadata-fetch.js";

/** Node entry CIMD fetch with response size and time limits (DIDI-1043). */
export const nodeCimdMetadataFetch = createBoundedCimdMetadataFetch(
  fetchNodeCimdMetadataResource,
);
