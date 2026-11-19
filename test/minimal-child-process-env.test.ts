import { tmpdir } from "node:os";
import { afterEach, describe, expect, it } from "vitest";
import { minimalChildProcessEnv } from "./helpers/minimal-child-process-env.js";

const PROBE_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "GITHUB_TOKEN",
  "PHYSIO_DIDI_1240_ENV_PROBE",
] as const;

describe("minimalChildProcessEnv (DIDI-1240)", () => {
  const prior: Partial<Record<(typeof PROBE_KEYS)[number], string | undefined>> = {};

  afterEach(() => {
    for (const key of PROBE_KEYS) {
      if (prior[key] === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = prior[key];
      }
    }
  });

  it("returns exactly PATH, HOME, and explicit extras with no process.env leakage", () => {
    for (const key of PROBE_KEYS) {
      prior[key] = process.env[key];
      process.env[key] = "probe-leak";
    }

    expect(minimalChildProcessEnv()).toEqual({
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? tmpdir(),
    });

    expect(
      minimalChildProcessEnv({
        PHYSIO_D1_DATABASE_ID: "00000000-0000-0000-0000-000000000002",
      }),
    ).toEqual({
      PATH: process.env.PATH ?? "",
      HOME: process.env.HOME ?? tmpdir(),
      PHYSIO_D1_DATABASE_ID: "00000000-0000-0000-0000-000000000002",
    });
  });
});
