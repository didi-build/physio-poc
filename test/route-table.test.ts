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
import { probedMutatingAppApiRouteKeys } from "../src/http/mutating-app-api-dispatch-probe.js";
import {
  buildMutatingAppApiRouteSamples,
  MUTATING_APP_API_ROUTE_SAMPLES,
  mutatingAppApiRouteSampleKey,
} from "../src/http/mutating-app-api-route-registry.js";
import { isMutatingAppApiPath } from "../src/http/mutating-app-api-csrf.js";
import {
  openMigratedDatabase,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { exerciseMediaTestDeps } from "./helpers/exercise-media-http.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const PROBE_BASE = "https://physio.test.example";
const PROBE_PRACTITIONER_ID = testOpaqueEntityId("route-table-practitioner");
const PROBE_EXERCISE_ID = testOpaqueEntityId("route-table-exercise");
const PROBE_VERSION_ID = testOpaqueEntityId("route-table-version");

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

  it("matches mutating app API registry samples to handler dispatch", async () => {
    for (const sample of MUTATING_APP_API_ROUTE_SAMPLES) {
      expect(isMutatingAppApiPath(sample.samplePath, sample.method)).toBe(true);
      expect(requiresPractitionerSession(sample.samplePath, sample.method)).toBe(true);
    }
    const storage = await openMigratedDatabase();
    await seedPractitioner(storage, PROBE_PRACTITIONER_ID);
    await seedExercise(storage, PROBE_PRACTITIONER_ID, PROBE_EXERCISE_ID);
    await storage.run(
      VERSION_INSERT_SQL,
      versionInsertBindings({
        id: PROBE_VERSION_ID,
        exercise_id: PROBE_EXERCISE_ID,
        status: "approved",
        approved_by: PROBE_PRACTITIONER_ID,
        approved_at: TS,
        title: "Probe",
      }),
    );
    const practitioner = {
      practitionerId: PROBE_PRACTITIONER_ID,
      email: "route-table@example.com",
      displayName: "Route table",
    };
    const deps = exerciseMediaTestDeps(storage, practitioner);
    const registryKeys = buildMutatingAppApiRouteSamples(
      PROBE_PRACTITIONER_ID,
      PROBE_EXERCISE_ID,
      PROBE_VERSION_ID,
    )
      .map(mutatingAppApiRouteSampleKey)
      .sort();
    const dispatchKeys = await probedMutatingAppApiRouteKeys(
      deps,
      practitioner,
      PROBE_PRACTITIONER_ID,
      PROBE_EXERCISE_ID,
      PROBE_VERSION_ID,
      PROBE_BASE,
    );
    expect(registryKeys).toEqual(dispatchKeys);
  });
});
