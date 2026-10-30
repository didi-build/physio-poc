import { describe, expect, it } from "vitest";
import {
  canonicalSessionPublicRouteSamples,
  HANDLE_REQUEST_BRANCHES,
  handleRequestRouteSamples,
  listSessionUnguardedSamplesFromRegistry,
  sessionGuardedForSample,
  sessionPublicRouteSampleKey,
} from "../src/auth/route-registry.js";
import { requiresPractitionerSession } from "../src/auth/public-routes.js";
import {
  MUTATING_APP_API_ROUTE_SAMPLES,
  mutatingAppApiRouteSampleKey,
} from "../src/http/mutating-app-api-route-registry.js";
import { isMutatingAppApiPath } from "../src/http/mutating-app-api-csrf.js";

describe("HTTP route table (session guards)", () => {
  it("covers every handleRequest branch with at least one sample", () => {
    const covered = new Set(
      handleRequestRouteSamples().map((sample) => sample.branchId),
    );
    expect([...covered].sort()).toEqual([...HANDLE_REQUEST_BRANCHES].sort());
  });

  it("derives session guard expectations from requiresPractitionerSession for every sample", () => {
    for (const sample of handleRequestRouteSamples()) {
      expect(sessionGuardedForSample(sample)).toBe(
        requiresPractitionerSession(sample.samplePath, sample.method, {
          fakeGoogleRoutesEnabled: sample.fakeGoogleRoutesEnabled === true,
        }),
      );
    }
  });

  it("pins the canonical session-public route list", () => {
    const fromRegistry = listSessionUnguardedSamplesFromRegistry()
      .map((sample) => `${sample.method} ${sample.samplePath}`)
      .sort();
    const canonical = canonicalSessionPublicRouteSamples()
      .map(sessionPublicRouteSampleKey)
      .sort();
    expect(fromRegistry).toEqual(canonical);
    for (const sample of canonicalSessionPublicRouteSamples()) {
      expect(
        requiresPractitionerSession(sample.samplePath, sample.method, {
          fakeGoogleRoutesEnabled: sample.fakeGoogleRoutesEnabled === true,
        }),
      ).toBe(false);
    }
  });

  it("covers every mutating app API route sample with the CSRF guard predicate", () => {
    const keys = MUTATING_APP_API_ROUTE_SAMPLES.map(
      mutatingAppApiRouteSampleKey,
    ).sort();
    expect(keys).toEqual(
      [
        "DELETE /api/practitioners/11111111-1111-4111-8111-111111111111/my-exercises/ex-example",
        "PATCH /api/practitioners/11111111-1111-4111-8111-111111111111/my-exercises/ex-example",
        "POST /api/practitioners/11111111-1111-4111-8111-111111111111/exercise-versions/ver-example/media/generate",
        "POST /api/practitioners/11111111-1111-4111-8111-111111111111/exercise-versions/ver-example/media/regenerate",
        "POST /api/practitioners/11111111-1111-4111-8111-111111111111/my-exercises/ex-example",
      ].sort(),
    );
    for (const sample of MUTATING_APP_API_ROUTE_SAMPLES) {
      expect(isMutatingAppApiPath(sample.samplePath, sample.method)).toBe(true);
      expect(requiresPractitionerSession(sample.samplePath, sample.method)).toBe(true);
    }
  });
});
