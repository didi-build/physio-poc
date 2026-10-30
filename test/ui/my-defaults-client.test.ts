import { describe, expect, it, vi } from "vitest";
import {
  MY_DEFAULTS_API_BASE,
  myDefaultsShareLinkExpiryPath,
  myDefaultsTypePath,
} from "../../src/my-defaults-api-paths.js";
import { MyDefaultsClient } from "../../src/ui/api/my-defaults-client.js";
import { GLOBAL_TYPE_DEFAULTS_SEED } from "../../src/domain/global-type-defaults-seed.js";
import { SHARE_LINK_EXPIRES_IN } from "../../src/mcp-connector/share-link-expiry.js";

describe("MyDefaultsClient (unit)", () => {
  it("GET uses the session my-defaults base path", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ exercise_types: [], share_link_expiry: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new MyDefaultsClient({ fetchFn });
    await client.getPage();
    expect(fetchFn).toHaveBeenCalledWith(MY_DEFAULTS_API_BASE, { method: "GET" });
  });

  it("DELETE sends application/json content-type and session type path", async () => {
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
    const client = new MyDefaultsClient({ fetchFn });
    await client.resetTypeDefault("isometric");
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(myDefaultsTypePath("isometric"));
    expect((init as RequestInit).method).toBe("DELETE");
    expect(new Headers((init as RequestInit).headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("PATCH share link expiry uses session path and exact JSON body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          global: { expiresIn: SHARE_LINK_EXPIRES_IN.one_year, customExpiresOn: null },
          practitioner: null,
          effective: {
            expiresIn: SHARE_LINK_EXPIRES_IN.one_year,
            customExpiresOn: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new MyDefaultsClient({ fetchFn });
    await client.updateShareLinkExpiry(SHARE_LINK_EXPIRES_IN.one_week);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(myDefaultsShareLinkExpiryPath());
    expect((init as RequestInit).method).toBe("PATCH");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({
      expires_in: SHARE_LINK_EXPIRES_IN.one_week,
    });
    expect(new Headers((init as RequestInit).headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("PUT type default uses session path and exact JSON body", async () => {
    const params = { hold_s: 45, per_day: 2, days_per_week: 4 };
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          type: "stretching",
          global_params: GLOBAL_TYPE_DEFAULTS_SEED.stretching,
          practitioner_params: params,
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new MyDefaultsClient({ fetchFn });
    await client.upsertTypeDefault("stretching", params);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, init] = fetchFn.mock.calls[0]!;
    expect(url).toBe(myDefaultsTypePath("stretching"));
    expect((init as RequestInit).method).toBe("PUT");
    expect(JSON.parse(String((init as RequestInit).body))).toEqual({ params });
    expect(new Headers((init as RequestInit).headers).get("content-type")).toBe(
      "application/json",
    );
  });

  it("PATCH share link expiry sends application/json content-type", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(
        JSON.stringify({
          global: { expiresIn: SHARE_LINK_EXPIRES_IN.one_year, customExpiresOn: null },
          practitioner: null,
          effective: {
            expiresIn: SHARE_LINK_EXPIRES_IN.one_year,
            customExpiresOn: null,
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      ),
    );
    const client = new MyDefaultsClient({ fetchFn });
    await client.updateShareLinkExpiry(SHARE_LINK_EXPIRES_IN.one_week);
    expect(
      new Headers((fetchFn.mock.calls[0]![1] as RequestInit).headers).get(
        "content-type",
      ),
    ).toBe("application/json");
  });
});
