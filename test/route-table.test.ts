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
  mutatingAppApiRouteSampleKeysFromHandlerTables,
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

  it("merges every handler mutating route table into registry samples", () => {
    for (const sample of MUTATING_APP_API_ROUTE_SAMPLES) {
      expect(isMutatingAppApiPath(sample.samplePath, sample.method)).toBe(true);
      expect(requiresPractitionerSession(sample.samplePath, sample.method)).toBe(true);
    }
    expect(
      MUTATING_APP_API_ROUTE_SAMPLES.map(mutatingAppApiRouteSampleKey).sort(),
    ).toEqual(mutatingAppApiRouteSampleKeysFromHandlerTables());
  });
});
