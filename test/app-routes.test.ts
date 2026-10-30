import { createElement } from "react";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  CONNECTOR_PHYSIO_APP_ROUTE_NAMES,
  EXERCISE_SEARCH_QUERY_PARAM,
  MAX_EXERCISE_SEARCH_QUERY_LENGTH,
  PHYSIO_APP_ROUTE_PATTERNS,
  buildPhysioAppUrl,
  buildProgramBuilderLink,
  buildWebAppExerciseSearchUrl,
  fillPhysioAppRoutePattern,
  type ConnectorPhysioAppRouteName,
  type PhysioAppSpaRouteName,
} from "../src/app-routes.js";
import { validateFreeTextForPatientDetails } from "../src/mcp-connector/patient-detail-validator.js";
import { createPhysioAppRouteObjects } from "../src/ui/physio-app-match-routes.js";

const BASE = "https://app.example.com";
const SAMPLE_PROGRAM_CODE = "PRG-7K3Q";
const SAMPLE_ROUTINE_ID = "rtn-knee-oa";

const appRouteObjects = createPhysioAppRouteObjects(createElement("div"));

function leafMatch(pathname: string) {
  const matches = matchRoutes(appRouteObjects, pathname);
  expect(matches, pathname).not.toBeNull();
  expect(matches!.length).toBeGreaterThan(0);
  const leaf = matches![matches!.length - 1]!;
  expect(leaf.route.path, pathname).not.toBe("*");
  return leaf;
}

function sampleConnectorUrl(routeName: ConnectorPhysioAppRouteName): string {
  switch (routeName) {
    case "exerciseSearch":
      return buildWebAppExerciseSearchUrl(BASE, "calf stretch");
    case "exercises":
      return buildPhysioAppUrl(BASE, "exercises");
    case "routines":
      return buildPhysioAppUrl(BASE, "routines");
    case "programNew":
      return buildProgramBuilderLink(BASE, { from_routine_id: SAMPLE_ROUTINE_ID });
    case "programBuilder":
      return buildProgramBuilderLink(BASE, { program_code: SAMPLE_PROGRAM_CODE });
    case "programPublish":
      return buildPhysioAppUrl(BASE, "programPublish", {
        routeParams: { programCode: SAMPLE_PROGRAM_CODE },
      });
    case "programShare":
      return buildPhysioAppUrl(BASE, "programShare", {
        routeParams: { programCode: SAMPLE_PROGRAM_CODE },
      });
    default: {
      const exhaustive: never = routeName;
      throw new Error(`Unhandled connector route: ${exhaustive}`);
    }
  }
}

describe("shared Physio app route table", () => {
  it("maps connector route names to patterns pinned in the route table", () => {
    expect(CONNECTOR_PHYSIO_APP_ROUTE_NAMES).toEqual([
      "exerciseSearch",
      "exercises",
      "routines",
      "programNew",
      "programBuilder",
      "programPublish",
      "programShare",
    ]);
    for (const name of CONNECTOR_PHYSIO_APP_ROUTE_NAMES) {
      expect(PHYSIO_APP_ROUTE_PATTERNS[name]).toMatch(/^\//);
    }
  });

  it("resolves every connector deep link to a named PhysioApp screen route", () => {
    for (const routeName of CONNECTOR_PHYSIO_APP_ROUTE_NAMES) {
      const url = sampleConnectorUrl(routeName);
      const pathname = new URL(url).pathname;
      const leaf = leafMatch(pathname);
      expect(leaf.route.id, routeName).toBe(routeName);
    }
    const blankNew = leafMatch(new URL(buildProgramBuilderLink(BASE, {})).pathname);
    expect(blankNew.route.id).toBe("programNew" satisfies PhysioAppSpaRouteName);
  });

  it("builds absolute https URLs with only codes and ids in paths and query", () => {
    const cases = [
      buildPhysioAppUrl(BASE, "programBuilder", {
        routeParams: { programCode: SAMPLE_PROGRAM_CODE },
      }),
      buildPhysioAppUrl(BASE, "programPublish", {
        routeParams: { programCode: SAMPLE_PROGRAM_CODE },
      }),
      buildPhysioAppUrl(BASE, "programShare", {
        routeParams: { programCode: SAMPLE_PROGRAM_CODE },
      }),
      buildProgramBuilderLink(BASE, { from_routine_id: SAMPLE_ROUTINE_ID }),
      buildProgramBuilderLink(BASE, { program_code: SAMPLE_PROGRAM_CODE }),
      buildProgramBuilderLink(BASE, {}),
    ];
    for (const url of cases) {
      expect(url.startsWith(`${BASE}/`)).toBe(true);
      const parsed = new URL(url);
      expect(parsed.origin).toBe(BASE);
      expect(parsed.pathname).not.toMatch(/patient|@|\+/i);
      for (const value of parsed.searchParams.values()) {
        expect(value).not.toMatch(/patient|@/i);
      }
    }
  });

  it("URL-encodes program codes in path segments", () => {
    const url = fillPhysioAppRoutePattern("programBuilder", {
      programCode: "PRG-TEST1",
    });
    expect(url).toBe("/programs/PRG-TEST1");
  });

  it("derives deprecated exercise search path constants from the route table", () => {
    expect(PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch).toBe("/exercises/search");
  });
});

describe("buildWebAppExerciseSearchUrl", () => {
  it("caps q at 200 characters and URL-encodes the value", () => {
    const long = "a".repeat(250);
    const url = buildWebAppExerciseSearchUrl(BASE, long);
    const params = new URLSearchParams(new URL(url).search);
    expect(params.get(EXERCISE_SEARCH_QUERY_PARAM)?.length).toBe(
      MAX_EXERCISE_SEARCH_QUERY_LENGTH,
    );
    expect(url).toContain(`${EXERCISE_SEARCH_QUERY_PARAM}=`);

    const tricky = "A & B? C# café 测试";
    const trickyUrl = buildWebAppExerciseSearchUrl(BASE, tricky);
    expect(
      trickyUrl.startsWith(`${BASE}${PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch}?`),
    ).toBe(true);
    const trickyParams = new URLSearchParams(new URL(trickyUrl).search);
    expect(trickyParams.get(EXERCISE_SEARCH_QUERY_PARAM)).toBe(tricky);
  });

  it("omits q when patient-detail validation fails", () => {
    const flagged = "Contact user@example.com for updates";
    const url = buildWebAppExerciseSearchUrl(BASE, flagged);
    expect(url).toBe(`${BASE}${PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch}`);
    expect(new URL(url).search).toBe("");
    expect(validateFreeTextForPatientDetails(flagged).ok).toBe(false);
  });

  it("keeps q for benign exercise search text", () => {
    const url = buildWebAppExerciseSearchUrl(BASE, "Glute bridge");
    expect(url).toBe(
      `${BASE}${PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch}?q=Glute+bridge`,
    );
  });
});
