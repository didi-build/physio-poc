import { describe, expect, it } from "vitest";
import type { AppDependencies } from "../src/http/app.js";
import {
  handlePractitionerSessionRequest,
  PRACTITIONER_SESSION_JSON_HEADERS,
} from "../src/http/routes/practitioner-session.js";
import { PRACTITIONER_SESSION_API_PATH } from "../src/practitioner-session-api-paths.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";

function minimalDeps(): AppDependencies {
  return {} as AppDependencies;
}

describe("handlePractitionerSessionRequest (handler-level)", () => {
  it("returns 401 when sessionPractitioner is null without guardAndRun", async () => {
    const response = await handlePractitionerSessionRequest(
      new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`, { method: "GET" }),
      minimalDeps(),
      { sessionPractitioner: null },
    );
    expect(response).not.toBeNull();
    expect(response!.status).toBe(401);
    expect(response!.headers.get("cache-control")).toBe("no-store");
    const body = (await response!.json()) as Record<string, unknown>;
    expect(body).toEqual({ error: "unauthorized" });
    expect(body).not.toHaveProperty("display_name");
    expect(body).not.toHaveProperty("practitioner_id");
  });

  it("returns 405 for non-GET methods with no identity fields in the body", async () => {
    const session = {
      practitionerId: testOpaqueEntityId("handler-session"),
      email: "coach@example.com",
      displayName: "Coach Handler",
    };
    for (const method of ["POST", "PUT", "DELETE"] as const) {
      const response = await handlePractitionerSessionRequest(
        new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`, { method }),
        minimalDeps(),
        { sessionPractitioner: session },
      );
      expect(response!.status).toBe(405);
      expect(response!.headers.get("cache-control")).toBe("no-store");
      const body = (await response!.json()) as Record<string, unknown>;
      expect(body).toEqual({ error: "method_not_allowed" });
      expect(body).not.toHaveProperty("display_name");
      expect(body).not.toHaveProperty("practitioner_id");
    }
  });

  it("returns only display_name and practitioner_id on 200", async () => {
    const practitionerId = testOpaqueEntityId("handler-200");
    const response = await handlePractitionerSessionRequest(
      new Request(`${BASE}${PRACTITIONER_SESSION_API_PATH}`, { method: "GET" }),
      minimalDeps(),
      {
        sessionPractitioner: {
          practitionerId,
          email: "alpha@example.com",
          displayName: "Coach Alpha",
        },
      },
    );
    expect(response!.status).toBe(200);
    expect(response!.headers.get("cache-control")).toBe(
      PRACTITIONER_SESSION_JSON_HEADERS["cache-control"],
    );
    const body = (await response!.json()) as Record<string, unknown>;
    expect(Object.keys(body).sort()).toEqual(["display_name", "practitioner_id"]);
    expect(body.display_name).toBe("Coach Alpha");
    expect(body.practitioner_id).toBe(practitionerId);
  });
});
