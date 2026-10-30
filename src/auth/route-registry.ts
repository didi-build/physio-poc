import { MCP_PATH } from "../http/app.js";
import { requiresPractitionerSession } from "./public-routes.js";

/**
 * Routes explicitly wired in handleRequest (not SPA client routes).
 * Session guard exceptions are fixed for DIDI-1001; Better Auth on Workers is DIDI-1044.
 */
export type RegisteredRoute = {
  readonly id: string;
  readonly sessionGuarded: boolean;
  readonly samplePath: string;
  readonly method: string;
};

export const SESSION_GUARD_EXCEPTION_IDS = [
  "health",
  "public-link",
  "better-auth-api",
] as const;

export const REGISTERED_ROUTES: readonly RegisteredRoute[] = [
  {
    id: "health",
    sessionGuarded: false,
    samplePath: "/health",
    method: "GET",
  },
  {
    id: "public-link",
    sessionGuarded: false,
    samplePath: "/l/demo-code",
    method: "GET",
  },
  {
    id: "better-auth-api",
    sessionGuarded: false,
    samplePath: "/api/auth/sign-in/social",
    method: "POST",
  },
  {
    id: "mcp",
    sessionGuarded: true,
    samplePath: MCP_PATH,
    method: "POST",
  },
  {
    id: "guarded-api",
    sessionGuarded: true,
    samplePath: "/api/unknown",
    method: "GET",
  },
  {
    id: "guarded-app-shell",
    sessionGuarded: true,
    samplePath: "/programs",
    method: "GET",
  },
] as const;

export function registeredRouteRequiresSession(route: RegisteredRoute): boolean {
  return requiresPractitionerSession(route.samplePath, route.method);
}
