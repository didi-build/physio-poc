import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  CONNECTOR_PHYSIO_APP_ROUTE_NAMES,
  PHYSIO_APP_ROUTE_PATTERNS,
  PHYSIO_APP_SPA_ROUTE_NAMES,
  buildPhysioAppUrl,
  buildProgramBuilderLink,
  fillPhysioAppRoutePattern,
  physioAppSpaRoutePath,
} from "../src/app-routes.js";

const APP_TSX = readFileSync(join(process.cwd(), "src/ui/App.tsx"), "utf8");

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

  it("keeps SPA router paths aligned with the route table", () => {
    expect(APP_TSX).toContain("PHYSIO_APP_SPA_ROUTE_NAMES.map");
    expect(APP_TSX).toContain("path={physioAppSpaRoutePath(routeName)}");
    for (const routeName of PHYSIO_APP_SPA_ROUTE_NAMES) {
      expect(physioAppSpaRoutePath(routeName)).toBe(
        PHYSIO_APP_ROUTE_PATTERNS[routeName].slice(1),
      );
    }
    expect(APP_TSX).toContain(`to={PHYSIO_APP_ROUTE_PATTERNS.exercises}`);
  });

  it("builds absolute https URLs with only codes and ids in paths and query", () => {
    const base = "https://app.example.com";
    const cases = [
      buildPhysioAppUrl(base, "programBuilder", {
        routeParams: { programCode: "PRG-7K3Q" },
      }),
      buildPhysioAppUrl(base, "programPublish", {
        routeParams: { programCode: "PRG-7K3Q" },
      }),
      buildPhysioAppUrl(base, "programShare", {
        routeParams: { programCode: "PRG-7K3Q" },
      }),
      buildProgramBuilderLink(base, { from_routine_id: "rtn-knee-oa" }),
      buildProgramBuilderLink(base, { program_code: "PRG-7K3Q" }),
      buildProgramBuilderLink(base, {}),
    ];
    for (const url of cases) {
      expect(url.startsWith(`${base}/`)).toBe(true);
      const parsed = new URL(url);
      expect(parsed.origin).toBe(base);
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
});
