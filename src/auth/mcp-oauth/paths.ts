export const PHYSIO_MCP_OAUTH_CONSENT_PATH = "/oauth/consent";
export const PHYSIO_MCP_OAUTH_CONSENT_ALLOW_PATH = "/oauth/consent/allow";
export const PHYSIO_MCP_OAUTH_CONSENT_DENY_PATH = "/oauth/consent/deny";

export const PHYSIO_MCP_OAUTH_BETTER_AUTH_CONSENT_PATH = "/api/auth/oauth2/consent";

export const PHYSIO_MCP_OAUTH_AUTH_SERVER_METADATA_PATH =
  "/.well-known/oauth-authorization-server";

const PHYSIO_MCP_OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PREFIX =
  "/.well-known/oauth-protected-resource";

/** Root `/.well-known/*` paths forwarded to Better Auth (explicit allowlist). */
export function isPhysioForwardedWellKnownPath(pathname: string): boolean {
  if (pathname === PHYSIO_MCP_OAUTH_AUTH_SERVER_METADATA_PATH) {
    return true;
  }
  if (pathname === PHYSIO_MCP_OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PREFIX) {
    return true;
  }
  if (
    pathname.startsWith(`${PHYSIO_MCP_OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PREFIX}/`)
  ) {
    const suffix = pathname.slice(
      `${PHYSIO_MCP_OAUTH_PROTECTED_RESOURCE_WELL_KNOWN_PREFIX}/`.length,
    );
    return suffix === "mcp";
  }
  return false;
}

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
