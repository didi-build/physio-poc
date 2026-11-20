import { describe, expect, it } from "vitest";
import {
  buildWorkerAuthSecretsPayload,
  productionWorkerOptionalSecretProblems,
} from "../scripts/lib/production-worker-auth-secrets.mjs";

const INVALID_PRODUCTION_WORKER_AUTH_SECRETS = "INVALID_PRODUCTION_WORKER_AUTH_SECRETS";
const OPTIONAL_SECRET_NAME = "PHYSIO_DEEPINFRA_API_KEY";

const BASE_AUTH_ENV = {
  GOOGLE_CLIENT_ID: "id",
  GOOGLE_CLIENT_SECRET: "sec",
  BETTER_AUTH_SECRET: "fixture-better-auth-secret-at-least-32-chars",
  PHYSIO_ALLOWED_GOOGLE_EMAILS: "coach@example.com",
};

describe("optional PHYSIO_DEEPINFRA_API_KEY deploy payload (DIDI-1212)", () => {
  it("rejects multiline optional secret in productionWorkerOptionalSecretProblems", () => {
    expect(
      productionWorkerOptionalSecretProblems({
        [OPTIONAL_SECRET_NAME]: "line-one\nline-two",
      }).invalid,
    ).toEqual([OPTIONAL_SECRET_NAME]);
  });

  it("buildWorkerAuthSecretsPayload throws INVALID_PRODUCTION_WORKER_AUTH_SECRETS for multiline optional key", () => {
    try {
      buildWorkerAuthSecretsPayload({
        ...BASE_AUTH_ENV,
        [OPTIONAL_SECRET_NAME]: "line-one\nline-two",
      });
      expect.fail("expected throw");
    } catch (error: unknown) {
      const err = error as { code?: string; invalid?: string[] };
      expect(err.code).toBe(INVALID_PRODUCTION_WORKER_AUTH_SECRETS);
      expect(err.invalid).toEqual([OPTIONAL_SECRET_NAME]);
    }
  });
});
