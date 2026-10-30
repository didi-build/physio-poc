import { describe, expect, it } from "vitest";
import {
  DEV_FAKE_GOOGLE_BETTER_AUTH_SECRET,
  InvalidAuthConfigError,
  resolveBetterAuthSecretForRuntime,
} from "../src/http/config.js";

describe("resolveBetterAuthSecretForRuntime (BETTER_AUTH_SECRET)", () => {
  it("requires BETTER_AUTH_SECRET when the fake Google provider is disabled", () => {
    expect(() =>
      resolveBetterAuthSecretForRuntime({
        betterAuthSecret: "",
        fakeGoogleProviderEnabled: false,
        nodeEnv: "development",
      }),
    ).toThrow(InvalidAuthConfigError);
  });

  it("allows the dev-only placeholder when the fake Google provider is enabled in development", () => {
    const secret = resolveBetterAuthSecretForRuntime({
      betterAuthSecret: "",
      fakeGoogleProviderEnabled: true,
      nodeEnv: "development",
    });
    expect(secret).toBe(DEV_FAKE_GOOGLE_BETTER_AUTH_SECRET);
  });

  it("accepts an explicit secret of at least 32 characters", () => {
    const secret = resolveBetterAuthSecretForRuntime({
      betterAuthSecret: "explicit-secret-at-least-32-characters-long",
      fakeGoogleProviderEnabled: false,
    });
    expect(secret).toBe("explicit-secret-at-least-32-characters-long");
  });
});
