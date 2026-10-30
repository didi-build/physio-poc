import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { cimdRedirectHostsMatchClientId } from "../../auth/mcp-oauth/cimd-redirect-host.js";

export function createCimdRedirectHostValidatingFetch(
  inner: ClientMetadataResourceFetch,
): ClientMetadataResourceFetch {
  return async (input, init) => {
    const response = await inner(input, init);
    if (!response.ok) {
      return response;
    }
    const clientId =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    let metadata: { redirect_uris?: string[] };
    try {
      metadata = (await response.clone().json()) as { redirect_uris?: string[] };
    } catch {
      return response;
    }
    if (!cimdRedirectHostsMatchClientId(clientId, metadata.redirect_uris ?? [])) {
      return new Response(null, { status: 400 });
    }
    return response;
  };
}
