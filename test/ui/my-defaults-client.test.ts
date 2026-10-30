import { describe, expect, it, vi } from "vitest";
import { MyDefaultsClient } from "../../src/ui/api/my-defaults-client.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../src/domain/global-type-defaults-seed.js";

describe("MyDefaultsClient (unit)", () => {
  it("DELETE sends application/json content-type", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "isometric",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.isometric,
          practitioner_params: null,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new MyDefaultsClient({
      fetchFn,
      practitionerId: "00000000-0000-4000-8000-000000000001",
    });
    await client.resetTypeDefault("isometric");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const init = fetchFn.mock.calls[0]![1] as RequestInit;
    expect(init.method).toBe("DELETE");
    expect(new Headers(init.headers).get("content-type")).toBe("application/json");
  });
});
