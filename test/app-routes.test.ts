import { createElement } from "react";
import { matchRoutes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import {
  CONNECTOR_PHYSIO_APP_ROUTE_NAMES,
  EXERCISE_SEARCH_QUERY_PARAM,
  PHYSIO_APP_ROUTE_PATTERNS,
  PHYSIO_APP_SPA_ROUTE_NAMES,
  buildPhysioAppUrl,
  buildProgramBuilderLink,
  buildStubPublicShareLink,
  buildWebAppExerciseSearchUrl,
  capRawExerciseSearchQueryForUrl,
  encodedExerciseSearchQueryLength,
  fillPhysioAppRoutePattern,
  type ConnectorPhysioAppRouteName,
  type PhysioAppSpaRouteName,
} from "../src/app-routes.js";
import { validateFreeTextForPatientDetails } from "../src/mcp-connector/patient-detail-validator.js";
import { createPhysioAppRouteObjects } from "../src/ui/physio-app-match-routes.js";

const BASE = "https://app.example.com";
const SAMPLE_PROGRAM_CODE = "PRG-7K3Q";
const SAMPLE_ROUTINE_ID = "550e8400-e29b-41d4-a716-446655440000";

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

  it("builds stub public share links from the route table", () => {
    expect(PHYSIO_APP_ROUTE_PATTERNS.stubPublicShareLink).toBe("/l/stub-share");
    expect(buildStubPublicShareLink(BASE)).toBe(`${BASE}/l/stub-share`);
  });

  it("PhysioApp route tree renders every SPA route without filtering", () => {
    const childRoutes = appRouteObjects[0]?.children ?? [];
    const routeIds = childRoutes
      .filter((route) => route.id !== undefined)
      .map((route) => route.id as string);
    expect(routeIds.sort()).toEqual([...PHYSIO_APP_SPA_ROUTE_NAMES].sort());
  });
});

describe("buildWebAppExerciseSearchUrl", () => {
  function encodedQParamFromUrl(url: string): string {
    const search = new URL(url).search.slice(1);
    const prefix = `${EXERCISE_SEARCH_QUERY_PARAM}=`;
    return search.startsWith(prefix) ? search.slice(prefix.length) : "";
  }

  it("URL-encodes the value and keeps encoded q length at most 199", () => {
    const tricky = "A & B? C# café 测试";
    const trickyUrl = buildWebAppExerciseSearchUrl(BASE, tricky);
    expect(
      trickyUrl.startsWith(`${BASE}${PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch}?`),
    ).toBe(true);
    const trickyParams = new URLSearchParams(new URL(trickyUrl).search);
    expect(trickyParams.get(EXERCISE_SEARCH_QUERY_PARAM)).toBe(tricky);
    expect(encodedQParamFromUrl(trickyUrl).length).toBeLessThanOrEqual(199);

    const raw201 = "a".repeat(201);
    expect(encodedExerciseSearchQueryLength(raw201)).toBe(201);
    const cappedUrl = buildWebAppExerciseSearchUrl(BASE, raw201);
    expect(encodedQParamFromUrl(cappedUrl).length).toBe(199);

    const raw250 = "a".repeat(250);
    expect(encodedExerciseSearchQueryLength(raw250)).toBe(250);
    const longUrl = buildWebAppExerciseSearchUrl(BASE, raw250);
    expect(encodedQParamFromUrl(longUrl).length).toBe(199);
    expect(new URLSearchParams(new URL(longUrl).search).get("q")?.length).toBe(199);
  });

  it("applies encoded-length cap after patient-detail check, not raw length first", () => {
    const flagged = "Contact user@example.com for updates";
    const url = buildWebAppExerciseSearchUrl(BASE, flagged);
    expect(url).toBe(`${BASE}${PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch}`);
    expect(new URL(url).search).toBe("");
    expect(validateFreeTextForPatientDetails(flagged).ok).toBe(false);

    const benignPrefix = "a".repeat(199);
    const benignWithEmail = `${benignPrefix} user@example.com`;
    expect(encodedExerciseSearchQueryLength(benignPrefix)).toBe(199);
    expect(validateFreeTextForPatientDetails(benignWithEmail).ok).toBe(false);
    const mixedUrl = buildWebAppExerciseSearchUrl(BASE, benignWithEmail);
    expect(mixedUrl).toBe(`${BASE}${PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch}`);
  });

  it("never splits a surrogate pair or emoji when capping encoded q", () => {
    const emojiTail = "😀";
    const raw = `${"a".repeat(90)}${emojiTail}`;
    expect([...raw].at(-1)).toBe(emojiTail);
    const capped = capRawExerciseSearchQueryForUrl(raw);
    if (capped.length > 0) {
      expect([...capped].at(-1)).not.toBe("\uD83D");
      expect([...capped].at(-1)).not.toBe("\uDE00");
    }
    expect(encodedExerciseSearchQueryLength(capped)).toBeLessThanOrEqual(199);
  });

  it("preserves ASCII space characters in encoded q length measurement", () => {
    const withSpaces = "Glute bridge and  calf  stretch";
    expect(withSpaces).toContain("  ");
    const url = buildWebAppExerciseSearchUrl(BASE, withSpaces);
    const decoded = new URLSearchParams(new URL(url).search).get(
      EXERCISE_SEARCH_QUERY_PARAM,
    );
    expect(decoded).toBe(withSpaces);
    expect(encodedExerciseSearchQueryLength(withSpaces)).toBe(
      encodedQParamFromUrl(url).length,
    );
  });

  it("never splits a percent escape when capping encoded q", () => {
    const repeated = "é".repeat(120);
    expect(encodedExerciseSearchQueryLength(repeated)).toBeGreaterThan(199);
    const capped = capRawExerciseSearchQueryForUrl(repeated);
    const encoded = encodedExerciseSearchQueryLength(capped);
    expect(encoded).toBeLessThanOrEqual(199);
    const roundTrip = new URLSearchParams({ q: capped }).toString().slice(2);
    expect(roundTrip).toBe(
      encodedQParamFromUrl(buildWebAppExerciseSearchUrl(BASE, repeated)),
    );
    expect(roundTrip).not.toMatch(/%[0-9A-Fa-f]?$/);
  });

  it("keeps q for benign exercise search text", () => {
    const url = buildWebAppExerciseSearchUrl(BASE, "Glute bridge");
    expect(url).toBe(
      `${BASE}${PHYSIO_APP_ROUTE_PATTERNS.exerciseSearch}?q=Glute+bridge`,
    );
  });
});
