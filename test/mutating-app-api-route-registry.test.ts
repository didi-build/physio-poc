import { describe, expect, it } from "vitest";
import {
  buildMutatingAppApiRouteSamples,
  MUTATING_APP_API_HANDLER_ROUTE_TABLES,
  MUTATING_APP_API_ROUTE_SAMPLES,
  mutatingAppApiRouteSampleKey,
  mutatingAppApiRouteSampleKeysFromHandlerTables,
} from "../src/http/mutating-app-api-route-registry.js";

describe("mutating app API route registry", () => {
  it("builds registry samples from every handler route table", () => {
    expect(
      MUTATING_APP_API_ROUTE_SAMPLES.map(mutatingAppApiRouteSampleKey).sort(),
    ).toEqual(mutatingAppApiRouteSampleKeysFromHandlerTables());
  });

  it("fails the merge check when a handler table adds a route not in the registry builder", () => {
    const practitionerId = "11111111-1111-4111-8111-111111111111";
    const exerciseId = "ex-example";
    const versionId = "ver-example";
    const fromHandlers = MUTATING_APP_API_HANDLER_ROUTE_TABLES.flatMap((table) =>
      table.routes(practitionerId, exerciseId, versionId).map((routeCase) =>
        mutatingAppApiRouteSampleKey({
          ruleId: table.ruleId,
          samplePath: routeCase.path,
          method: routeCase.method,
        }),
      ),
    ).sort();
    const withDummy = [
      ...fromHandlers,
      `POST /api/practitioners/${practitionerId}/mutant-only-route`,
    ].sort();
    const registryKeys = buildMutatingAppApiRouteSamples(
      practitionerId,
      exerciseId,
      versionId,
    )
      .map(mutatingAppApiRouteSampleKey)
      .sort();
    expect(withDummy).not.toEqual(registryKeys);
    expect(registryKeys).toEqual(fromHandlers);
  });
});
