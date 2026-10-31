import { isAuthAppApiPath } from "./auth-app-api-prefix.js";
import { MCP_PATH } from "../http/app.js";

export type SessionGuardOptions = {
  /** Dev/test only: marks paths public for session guard (set from Node entry, not Worker). */
  extraSessionPublicPath?: (pathname: string) => boolean;
};

export type SessionPublicRouteSample = {
  readonly ruleId: string;
  readonly samplePath: string;
  readonly method: string;
  readonly extraSessionPublicPath?: (pathname: string) => boolean;
};

/**
 * Canonical session-public routes (DIDI-1001 CTO). Used by the route guard test and
 * `requiresPractitionerSession`.
 */
export const SESSION_PUBLIC_ROUTE_SAMPLES: readonly SessionPublicRouteSample[] = [
  { ruleId: "health", samplePath: "/health", method: "GET" },
  { ruleId: "health", samplePath: "/health", method: "HEAD" },
  { ruleId: "health", samplePath: "/health", method: "POST" },
  { ruleId: "public-link", samplePath: "/l/demo-code", method: "GET" },
  { ruleId: "better-auth-api", samplePath: "/api/auth/sign-in/social", method: "POST" },
  { ruleId: "sign-in", samplePath: "/sign-in", method: "GET" },
  { ruleId: "build-assets", samplePath: "/assets/index.js", method: "GET" },
  { ruleId: "build-assets", samplePath: "/favicon.ico", method: "GET" },
  { ruleId: "build-assets", samplePath: "/vite.svg", method: "GET" },
  { ruleId: "options-preflight", samplePath: "/programs", method: "OPTIONS" },
] as const;

export function isPublicAppPath(pathname: string): boolean {
  if (pathname === "/health") {
    return true;
  }
  if (pathname === "/sign-in") {
    return true;
  }
  if (pathname.startsWith("/l/")) {
    return true;
  }
  if (pathname.startsWith("/assets/")) {
    return true;
  }
  if (pathname === "/favicon.ico" || pathname === "/vite.svg") {
    return true;
  }
  return false;
}

export function isPublicApiAuthPath(pathname: string): boolean {
  return isAuthAppApiPath(pathname);
}

export function requiresPractitionerSession(
  pathname: string,
  method: string,
  options: SessionGuardOptions = {},
): boolean {
  if (method === "OPTIONS") {
    return false;
  }
  if (pathname === MCP_PATH || pathname === `${MCP_PATH}/`) {
    return true;
  }
  if (pathname.startsWith("/api/")) {
    return !isPublicApiAuthPath(pathname);
  }
  if (options.extraSessionPublicPath?.(pathname)) {
    return false;
  }
  if (isPublicAppPath(pathname)) {
    return false;
  }
  return true;
}

export function sessionPublicRouteSampleKey(sample: SessionPublicRouteSample): string {
  return `${sample.method} ${sample.samplePath}`;
}
