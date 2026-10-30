export const PHYSIO_MCP_OAUTH_CONSENT_PATH = "/oauth/consent";
export const PHYSIO_MCP_OAUTH_CONSENT_ALLOW_PATH = "/oauth/consent/allow";
export const PHYSIO_MCP_OAUTH_CONSENT_DENY_PATH = "/oauth/consent/deny";

export const PHYSIO_MCP_OAUTH_AUTH_SERVER_METADATA_PATH =
  "/.well-known/oauth-authorization-server";

export function isPhysioMcpOAuthConsentPath(pathname: string): boolean {
  return (
    pathname === PHYSIO_MCP_OAUTH_CONSENT_PATH ||
    pathname === PHYSIO_MCP_OAUTH_CONSENT_ALLOW_PATH ||
    pathname === PHYSIO_MCP_OAUTH_CONSENT_DENY_PATH
  );
}

export function mcpOAuthResourceUrl(authBaseUrl: string): string {
  return `${authBaseUrl.replace(/\/$/, "")}/mcp`;
}
