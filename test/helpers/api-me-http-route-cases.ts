import type { PrescriptionType } from "../../src/domain/exercise-types.js";
import {
  MY_DEFAULTS_API_BASE,
  myDefaultsShareLinkExpiryPath,
  myDefaultsTypePath,
} from "../../src/my-defaults-api-paths.js";
import { SHARE_LINK_EXPIRES_IN } from "../../src/mcp-connector/share-link-expiry.js";
import {
  programBuilderHttpJsonBody,
  programBuilderHttpRouteCases,
  type ProgramBuilderHttpProbeContext,
  type ProgramBuilderHttpRouteCase,
} from "./program-builder-http-route-cases.js";
import { testOpaqueEntityId } from "./opaque-test-ids.js";

export type ApiMeHttpRouteCase = ProgramBuilderHttpRouteCase;

export const API_ME_HTTP_METHODS = ["GET", "POST", "PATCH", "PUT", "DELETE"] as const;

export type ApiMeHttpMethod = (typeof API_ME_HTTP_METHODS)[number];

const DEFAULT_MY_DEFAULTS_TYPE: PrescriptionType = "stretching";

export function myDefaultsHttpRouteCases(
  type: PrescriptionType = DEFAULT_MY_DEFAULTS_TYPE,
): readonly ApiMeHttpRouteCase[] {
  return [
    { method: "GET", path: MY_DEFAULTS_API_BASE },
    { method: "PATCH", path: myDefaultsShareLinkExpiryPath() },
    { method: "PUT", path: myDefaultsTypePath(type) },
    { method: "DELETE", path: myDefaultsTypePath(type) },
  ];
}

export function apiMeHttpRouteCases(
  programId?: string,
  rowId?: string,
  myDefaultsType: PrescriptionType = DEFAULT_MY_DEFAULTS_TYPE,
): readonly ApiMeHttpRouteCase[] {
  return [
    ...programBuilderHttpRouteCases(programId, rowId),
    ...myDefaultsHttpRouteCases(myDefaultsType),
  ];
}

export function defaultApiMeHttpProbeContext(): ProgramBuilderHttpProbeContext {
  return {
    createProgramId: testOpaqueEntityId("api-me-table-create-program"),
    rowId: testOpaqueEntityId("api-me-table-row"),
    exerciseId: testOpaqueEntityId("api-me-table-exercise"),
    orderedRowIds: [testOpaqueEntityId("api-me-table-row-order-a")],
    duplicateNewRowId: testOpaqueEntityId("api-me-table-dup-row"),
    routineId: testOpaqueEntityId("api-me-table-routine"),
    fromRoutineRowIds: [testOpaqueEntityId("api-me-table-from-routine-row")],
  };
}

export function apiMeHttpJsonBody(
  routeCase: ApiMeHttpRouteCase,
  ctx: ProgramBuilderHttpProbeContext,
): string | undefined {
  if (routeCase.path.startsWith(MY_DEFAULTS_API_BASE)) {
    if (routeCase.path === myDefaultsShareLinkExpiryPath()) {
      return JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.one_week });
    }
    if (routeCase.path.startsWith(`${MY_DEFAULTS_API_BASE}/types/`)) {
      if (routeCase.method === "PUT") {
        return JSON.stringify({
          params: { hold_s: 30, per_day: 1, days_per_week: 3 },
        });
      }
      if (routeCase.method === "DELETE") {
        return "{}";
      }
    }
    return undefined;
  }
  if (routeCase.method === "DELETE") {
    return undefined;
  }
  return programBuilderHttpJsonBody(routeCase, ctx);
}
