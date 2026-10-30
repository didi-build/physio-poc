import type { AuthPort, PractitionerSession } from "./auth-port.js";

export type FakeAuthPortOptions = {
  practitioner: PractitionerSession | null;
  sessionCookieName?: string;
};

const DEFAULT_COOKIE = "physio.fake_session";

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

  async handleAuthRequest(_request: Request): Promise<Response | null> {
    void _request;
    return null;
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
