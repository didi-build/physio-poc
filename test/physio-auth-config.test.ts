import { describe, expect, it } from "vitest";
import { createBetterAuthInstance } from "../src/adapters/node/create-better-auth.js";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import {
  resolveBetterAuthSecretForRuntime,
  InvalidAuthConfigError,
} from "../src/http/config.js";
import {
  createPhysioServerConfig,
  resolvePhysioAuthConfig,
} from "../src/http/config.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";

describe("resolveBetterAuthSecretForRuntime (BETTER_AUTH_SECRET)", () => {
  it("rejects a missing secret when NODE_ENV is unset", () => {
    const prior = process.env.NODE_ENV;
    delete process.env.NODE_ENV;
    try {
      expect(() => resolveBetterAuthSecretForRuntime("")).toThrow(
        InvalidAuthConfigError,
      );
    } finally {
      if (prior === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = prior;
      }
    }
  });

  it("rejects a missing secret when NODE_ENV is development", () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";
    try {
      expect(() => resolveBetterAuthSecretForRuntime("")).toThrow(
        InvalidAuthConfigError,
      );
    } finally {
      if (prior === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = prior;
      }
    }
  });

  it("rejects a missing secret when NODE_ENV is production", () => {
    const prior = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      expect(() => resolveBetterAuthSecretForRuntime("")).toThrow(
        InvalidAuthConfigError,
      );
    } finally {
      if (prior === undefined) {
        delete process.env.NODE_ENV;
      } else {
        process.env.NODE_ENV = prior;
      }
    }
  });

  it("rejects a missing secret when the fake Google provider is enabled in config", () => {
    const auth = resolvePhysioAuthConfig({
      fakeGoogleProvider: "true",
      nodeEnv: "development",
    });
    expect(() => resolveBetterAuthSecretForRuntime(auth.betterAuthSecret)).toThrow(
      InvalidAuthConfigError,
    );
  });

  it("accepts an explicit secret of at least 32 characters", () => {
    expect(resolveBetterAuthSecretForRuntime(PHYSIO_TEST_BETTER_AUTH_SECRET)).toBe(
      PHYSIO_TEST_BETTER_AUTH_SECRET,
    );
  });

  it("rejects the .dev.vars.example placeholder secret", () => {
    expect(() =>
      resolveBetterAuthSecretForRuntime("replace-me-with-at-least-32-characters-long"),
    ).toThrow(InvalidAuthConfigError);
  });
});

describe("createBetterAuthInstance startup (integration)", () => {
  it("fails closed when BETTER_AUTH_SECRET is missing", () => {
    const storage = BetterSqliteStorage.openInMemory();
    const config = createPhysioServerConfig({
      auth: {
        betterAuthSecret: "",
        googleClientId: "fake",
        googleClientSecret: "fake",
        allowedGoogleEmails: new Set(["a@example.com"]),
        fakeGoogleProviderEnabled: true,
        authBaseUrl: "http://127.0.0.1:8787",
      },
    }).auth;
    expect(() =>
      createBetterAuthInstance(storage.nativeDatabase(), config, storage),
    ).toThrow(InvalidAuthConfigError);
  });
});
