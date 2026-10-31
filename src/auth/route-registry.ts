import { MCP_PATH } from "../http/app.js";
import {
  requiresPractitionerSession,
  SESSION_PUBLIC_ROUTE_SAMPLES,
  sessionPublicRouteSampleKey,
  type SessionPublicRouteSample,
} from "./public-routes.js";

/**
 * One sample request per branch in `handleRequest` (see src/http/app.ts).
 */
export const HANDLE_REQUEST_BRANCHES = [
  "health-read",
  "health-post",
  "fake-google-oauth",
  "better-auth-api",
  "ui-static-asset",
  "mcp",
  "guarded-api",
  "app-shell",
] as const;

export type HandleRequestBranchId = (typeof HANDLE_REQUEST_BRANCHES)[number];

export type HandleRequestRouteSample = {
  readonly branchId: HandleRequestBranchId;
  readonly samplePath: string;
  readonly method: string;
  readonly fakeGoogleRoutesEnabled?: boolean;
};

const HANDLE_REQUEST_ROUTE_SAMPLES: readonly HandleRequestRouteSample[] = [
  { branchId: "health-read", samplePath: "/health", method: "GET" },
  { branchId: "health-read", samplePath: "/health", method: "HEAD" },
  { branchId: "health-post", samplePath: "/health", method: "POST" },
  {
    branchId: "fake-google-oauth",
    samplePath: "/__fake-google/o/oauth2/v2/auth",
    method: "GET",
    fakeGoogleRoutesEnabled: true,
  },
  {
    branchId: "better-auth-api",
    samplePath: "/api/auth/sign-in/social",
    method: "POST",
  },
  { branchId: "ui-static-asset", samplePath: "/assets/index.js", method: "GET" },
  { branchId: "mcp", samplePath: MCP_PATH, method: "POST" },
  { branchId: "guarded-api", samplePath: "/api/auth", method: "POST" },
  { branchId: "guarded-api", samplePath: "/api/unknown", method: "GET" },
  {
    branchId: "guarded-api",
    samplePath:
      "/api/practitioners/11111111-1111-4111-8111-111111111111/exercises/approved/search",
    method: "GET",
  },
  { branchId: "guarded-api", samplePath: "/api/me/programs", method: "GET" },
  { branchId: "app-shell", samplePath: "/sign-in", method: "GET" },
  { branchId: "app-shell", samplePath: "/l/demo-code", method: "GET" },
  { branchId: "app-shell", samplePath: "/favicon.ico", method: "GET" },
  { branchId: "app-shell", samplePath: "/vite.svg", method: "GET" },
  { branchId: "app-shell", samplePath: "/programs", method: "GET" },
  { branchId: "app-shell", samplePath: "/programs", method: "OPTIONS" },
];

export function handleRequestRouteSamples(): readonly HandleRequestRouteSample[] {
  return HANDLE_REQUEST_ROUTE_SAMPLES;
}

export function sessionGuardedForSample(sample: HandleRequestRouteSample): boolean {
  return requiresPractitionerSession(sample.samplePath, sample.method, {
    fakeGoogleRoutesEnabled: sample.fakeGoogleRoutesEnabled === true,
  });
}

export function canonicalSessionPublicRouteSamples(): readonly SessionPublicRouteSample[] {
  return SESSION_PUBLIC_ROUTE_SAMPLES;
}

export function listSessionUnguardedSamplesFromRegistry(): HandleRequestRouteSample[] {
  return HANDLE_REQUEST_ROUTE_SAMPLES.filter(
    (sample) => !sessionGuardedForSample(sample),
  );
}

export { sessionPublicRouteSampleKey };
