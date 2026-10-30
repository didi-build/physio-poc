import type { AuthPort } from "./auth-port.js";

function isBetterAuthPath(pathname: string): boolean {
  return pathname === "/api/auth" || pathname.startsWith("/api/auth/");
}

/**
 * Worker entry auth until Better Auth on Workers (DIDI-1044).
 * Never establishes a session; auth endpoints respond with 503.
 */
export class FailClosedAuthPort implements AuthPort {
  async getPractitioner(request: Request): Promise<null> {
    void request;
    return null;
  }

  async handleAuthRequest(request: Request): Promise<Response | null> {
    const pathname = new URL(request.url).pathname;
    if (isBetterAuthPath(pathname)) {
      return new Response(null, { status: 503 });
    }
    return null;
  }

  async signOut(request: Request): Promise<Response> {
    void request;
    return new Response(null, { status: 503 });
  }
}
