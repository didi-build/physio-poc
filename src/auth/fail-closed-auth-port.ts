import type { AuthPort } from "./auth-port.js";
import { isAuthAppApiPath } from "./auth-app-api-prefix.js";

/**
 * Worker entry auth when production secrets or D1 are missing (DIDI-1153).
 * Never establishes a session; auth endpoints respond with 503.
 */
export class FailClosedAuthPort implements AuthPort {
  async getPractitioner(request: Request): Promise<null> {
    void request;
    return null;
  }

  async handleAuthRequest(request: Request): Promise<Response | null> {
    const pathname = new URL(request.url).pathname;
    if (isAuthAppApiPath(pathname)) {
      return new Response(null, { status: 503 });
    }
    return null;
  }

  async signOut(request: Request): Promise<Response> {
    void request;
    return new Response(null, { status: 503 });
  }
}
