/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { postAuthSignInSocial, postAuthSignOut } from "../../src/ui/api/auth-client.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("auth-client", () => {
  it("posts sign-in social with credentials include and JSON body", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response("{}"));
    await postAuthSignInSocial(
      { provider: "google", callbackURL: "/programs" },
      { fetchFn },
    );
    expect(fetchFn).toHaveBeenCalledWith("/api/auth/sign-in/social", {
      method: "POST",
      headers: { "content-type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ provider: "google", callbackURL: "/programs" }),
    });
  });

  it("posts sign-out with credentials include", async () => {
    const fetchFn = vi.fn().mockResolvedValue(new Response(null, { status: 200 }));
    await postAuthSignOut({ fetchFn });
    expect(fetchFn).toHaveBeenCalledWith("/api/auth/sign-out", {
      method: "POST",
      credentials: "include",
    });
  });
});
