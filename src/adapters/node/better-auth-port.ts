import type { AuthPort, PractitionerSession } from "../../auth/auth-port.js";
import { authRefusalResponse } from "../../http/auth-pages.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { findPractitionerByEmail } from "../../storage/repositories/practitioner-auth.js";
import type { BetterAuthRuntime } from "./better-auth-types.js";

const AUTH_PREFIX = "/api/auth";

export class BetterAuthPort implements AuthPort {
  constructor(
    private readonly auth: BetterAuthRuntime,
    private readonly sql: SqlStoragePort,
    private readonly displayName: string,
  ) {}

  async getPractitioner(request: Request): Promise<PractitionerSession | null> {
    const session = await this.auth.api.getSession({
      headers: request.headers,
    });
    const email = session?.user?.email;
    if (!email) {
      return null;
    }
    const practitioner = await findPractitionerByEmail(this.sql, email);
    if (!practitioner) {
      return null;
    }
    return {
      practitionerId: practitioner.id,
      email: practitioner.email,
      displayName: this.displayName,
    };
  }

  async handleAuthRequest(request: Request): Promise<Response | null> {
    const url = new URL(request.url);
    if (url.pathname === `${AUTH_PREFIX}/refused`) {
      return authRefusalResponse();
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
