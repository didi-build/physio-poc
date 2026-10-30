import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import { cimd } from "@better-auth/cimd";
import { mcp } from "@better-auth/mcp";
import type { PhysioAuthConfig } from "../../http/config.js";
import { mcpOAuthResourceUrl } from "../../auth/mcp-oauth/paths.js";
import {
  hostFromUrl,
  sanitizeOAuthClientDisplayName,
} from "../../auth/mcp-oauth/sanitize-client-name.js";
import { createCimdRedirectHostValidatingFetch } from "./cimd-redirect-host-validating-fetch.js";

export const PHYSIO_MCP_OAUTH_SCOPES = [
  "openid",
  "profile",
  "email",
  "offline_access",
] as const;

export function createPhysioMcpOAuthPlugins(
  config: PhysioAuthConfig,
  cimdMetadataFetch: ClientMetadataResourceFetch,
) {
  const resource = mcpOAuthResourceUrl(config.authBaseUrl);
  const mcpPlugin = mcp({
    loginPage: "/api/auth/sign-in/social",
    consentPage: "/oauth/consent",
    resource,
    scopes: [...PHYSIO_MCP_OAUTH_SCOPES],
    allowDynamicClientRegistration: true,
    clientRegistrationDefaultScopes: [...PHYSIO_MCP_OAUTH_SCOPES],
    refreshTokenReuseInterval: 30,
  });
  const cimdPlugin = cimd({
    fetchClientMetadataResource:
      createCimdRedirectHostValidatingFetch(cimdMetadataFetch),
    metadataProfile: "mcp-2026-07-28",
    onClientCreated: async (event) => {
      const sanitized = sanitizeOAuthClientDisplayName(
        event.clientMetadataDocument.client_name ?? event.client.name ?? null,
        hostFromUrl(event.client.clientId),
      );
      if (sanitized !== event.client.name) {
        await event.context.context.adapter.update({
          model: "oauthClient",
          where: [{ field: "clientId", value: event.client.clientId }],
          update: { name: sanitized },
        });
      }
    },
  });
  return { mcpPlugin, cimdPlugin, mcpResourceUrl: resource };
}
