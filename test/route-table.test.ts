import { describe, expect, it } from "vitest";
import {
  REGISTERED_ROUTES,
  SESSION_GUARD_EXCEPTION_IDS,
  registeredRouteRequiresSession,
} from "../src/auth/route-registry.js";

describe("HTTP route table (session guards)", () => {
  it("lists only health, public links, and Better Auth API as session guard exceptions", () => {
    const unguarded = REGISTERED_ROUTES.filter((route) => !route.sessionGuarded).map(
      (route) => route.id,
    );
    expect([...new Set(unguarded)].sort()).toEqual(
      [...SESSION_GUARD_EXCEPTION_IDS].sort(),
    );
  });

  it("matches requiresPractitionerSession for every registered route", () => {
    for (const route of REGISTERED_ROUTES) {
      expect(registeredRouteRequiresSession(route)).toBe(route.sessionGuarded);
    }
  });
});
