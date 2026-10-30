import {
  oauthProviderAuthServerMetadata,
  verifyOAuthQueryParams,
} from "@better-auth/oauth-provider";
import type { AuthPort, PractitionerSession } from "../../auth/auth-port.js";
import {
  deleteAuthSessionByToken,
  resolveBoundPractitionerSession,
} from "../../auth/resolve-bound-practitioner-session.js";
import {
  handlePhysioMcpConsentRoutes,
  type PhysioMcpConsentClock,
} from "../../auth/mcp-oauth/consent-routes.js";
import {
  PHYSIO_MCP_OAUTH_AUTH_SERVER_METADATA_PATH,
  isPhysioForwardedWellKnownPath,
  isPhysioMcpOAuthConsentPath,
} from "../../auth/mcp-oauth/paths.js";
import {
  handleAuthOAuthErrorRequest,
  isAuthOAuthErrorPath,
} from "../../http/auth-oauth-error.js";
import type { PhysioAuthConfig } from "../../http/config.js";
import { resolveBetterAuthSecretForRuntime } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import type { BetterAuthRuntime } from "./better-auth-types.js";

const AUTH_PREFIX = "/api/auth";

export class BetterAuthPort implements AuthPort {
  private readonly authSecret: string;

  constructor(
    private readonly auth: BetterAuthRuntime,
    private readonly sql: SqlStoragePort,
    private readonly authConfig: PhysioAuthConfig,
    private readonly consentClock?: PhysioMcpConsentClock,
  ) {
    this.authSecret = resolveBetterAuthSecretForRuntime(authConfig.betterAuthSecret);
  }

  async getPractitioner(request: Request): Promise<PractitionerSession | null> {
    const payload = await this.auth.api.getSession({
      headers: request.headers,
    });
    const sessionToken = payload?.session?.token;
    if (!sessionToken) {
      return null;
    }
    const resolved = await resolveBoundPractitionerSession(this.sql, this.authConfig, {
      email: payload?.user?.email,
      name: payload?.user?.name,
      boundPractitionerId: payload?.user?.practitionerId,
      sessionToken,
    });
    if (resolved.ok) {
      return resolved.session;
    }
    if (resolved.shouldDeleteSession) {
      await deleteAuthSessionByToken(this.sql, sessionToken);
    }
    return null;
  }

  async handleAuthRequest(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    if (isAuthOAuthErrorPath(url.pathname)) {
      return handleAuthOAuthErrorRequest(url);
    }

    if (isPhysioMcpOAuthConsentPath(url.pathname)) {
      const practitioner = await this.getPractitioner(request);
      const consentResponse = await handlePhysioMcpConsentRoutes({
        request,
        pathname: url.pathname,
        auth: this.auth,
        sql: this.sql,
        authBaseUrl: this.authConfig.authBaseUrl,
        authSecret: this.authSecret,
        practitioner,
        verifyOAuthQueryParams: (oauthQuery, secret) =>
          verifyOAuthQueryParams(oauthQuery, secret),
        clock: this.consentClock,
      });
      if (consentResponse) {
        return consentResponse;
      }
    }

    if (url.pathname === PHYSIO_MCP_OAUTH_AUTH_SERVER_METADATA_PATH) {
      return oauthProviderAuthServerMetadata(this.auth as never)(request);
    }

    if (url.pathname.startsWith("/.well-known/")) {
      if (!isPhysioForwardedWellKnownPath(url.pathname)) {
        return new Response(null, { status: 404 });
      }
      return this.auth.handler(request);
    }

    if (url.pathname.startsWith(`${AUTH_PREFIX}/`)) {
      return this.auth.handler(request);
    }

    return null;
  }

  async signOut(request: Request): Promise<Response> {
    return this.auth.handler(
      new Request(new URL("/api/auth/sign-out", request.url), {
        method: "POST",
        headers: request.headers,
      }),
    );
  }

  getBetterAuthRuntime(): BetterAuthRuntime {
    return this.auth;
  }
}
