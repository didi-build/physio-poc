import type { AuthPort, PractitionerSession } from "./auth-port.js";
import { isAuthAppApiPath } from "./auth-app-api-prefix.js";

export type FakeAuthPortOptions = {
  practitioner: PractitionerSession | null;
  sessionCookieName?: string;
};

const DEFAULT_COOKIE = "physio.fake_session";
const JSON_HEADERS = { "content-type": "application/json" };

export class FakeAuthPort implements AuthPort {
  private practitioner: PractitionerSession | null;
  private readonly cookieName: string;

  constructor(options: FakeAuthPortOptions) {
    this.practitioner = options.practitioner;
    this.cookieName = options.sessionCookieName ?? DEFAULT_COOKIE;
  }

  setPractitioner(practitioner: PractitionerSession | null): void {
    this.practitioner = practitioner;
  }

  async getPractitioner(request: Request): Promise<PractitionerSession | null> {
    if (!this.practitioner) {
      return null;
    }
    const cookie = request.headers.get("cookie") ?? "";
    if (!cookie.includes(`${this.cookieName}=1`)) {
      return null;
    }
    return this.practitioner;
  }

  async handleAuthRequest(request: Request): Promise<Response | null> {
    const pathname = new URL(request.url).pathname;
    if (!isAuthAppApiPath(pathname)) {
      return null;
    }
    if (pathname === "/api/auth/sign-out" && request.method === "POST") {
      return this.signOut(request);
    }
    return Response.json(
      { error: "not_found" },
      { status: 404, headers: JSON_HEADERS },
    );
  }

  async signOut(_request: Request): Promise<Response> {
    void _request;
    return new Response(null, {
      status: 204,
      headers: {
        "set-cookie": `${this.cookieName}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`,
      },
    });
  }

  createSessionCookieHeader(): string {
    return `${this.cookieName}=1; Path=/; HttpOnly; Secure; SameSite=Lax`;
  }
}
