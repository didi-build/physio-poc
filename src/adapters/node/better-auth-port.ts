import type { AuthPort, PractitionerSession } from "../../auth/auth-port.js";
import {
  deleteAuthSessionByToken,
  resolveBoundPractitionerSession,
} from "../../auth/resolve-bound-practitioner-session.js";
import {
  handleAuthOAuthErrorRequest,
  isAuthOAuthErrorPath,
} from "../../http/auth-oauth-error.js";
import type { PhysioAuthConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import type { BetterAuthRuntime } from "./better-auth-types.js";

const AUTH_PREFIX = "/api/auth";

export class BetterAuthPort implements AuthPort {
  constructor(
    private readonly auth: BetterAuthRuntime,
    private readonly sql: SqlStoragePort,
    private readonly authConfig: PhysioAuthConfig,
  ) {}

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
    if (!url.pathname.startsWith(`${AUTH_PREFIX}/`)) {
      return null;
    }
    return this.auth.handler(request);
  }

  async signOut(request: Request): Promise<Response> {
    return this.auth.handler(
      new Request(new URL("/api/auth/sign-out", request.url), {
        method: "POST",
        headers: request.headers,
      }),
    );
  }
}
