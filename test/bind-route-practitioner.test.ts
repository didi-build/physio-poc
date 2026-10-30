import { describe, expect, it } from "vitest";
import { bindRoutePractitionerId } from "../src/http/bind-route-practitioner.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

describe("bindRoutePractitionerId (unit)", () => {
  it("returns exactly 401 when session is null", async () => {
    const pathId = testOpaqueEntityId("bind-route-null-session");
    const result = bindRoutePractitionerId(pathId, null);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.response.status).toBe(401);
      await expect(result.response.json()).resolves.toEqual({ error: "unauthorized" });
    }
  });
});
