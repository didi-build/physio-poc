import { describe, expect, it } from "vitest";
import { resolveNodePhysioServerConfig } from "../src/adapters/node/resolve-node-config.js";
import { resolveWorkerPhysioServerConfig } from "../src/adapters/workers/resolve-worker-config.js";
import {
  DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS,
  DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS,
  DEFAULT_ROUTINE_SIMILAR_THRESHOLD,
  resolveRoutineSimilarityConfig,
} from "../src/routine-similarity-config.js";
import { PHYSIO_TEST_BETTER_AUTH_SECRET } from "./helpers/physio-test-auth-secret.js";
import { buildWorkerProductionAuthEnv } from "./helpers/worker-production-auth-test-utils.js";

const NODE_SIMILAR_FIXTURE = {
  BETTER_AUTH_SECRET: PHYSIO_TEST_BETTER_AUTH_SECRET,
  GOOGLE_CLIENT_ID: "test-google-client-id",
  GOOGLE_CLIENT_SECRET: "test-google-client-secret",
} as const;

describe("resolveRoutineSimilarityConfig (DIDI-1225 env validation)", () => {
  it("uses defaults when env vars are absent", () => {
    expect(resolveRoutineSimilarityConfig({})).toEqual({
      threshold: DEFAULT_ROUTINE_SIMILAR_THRESHOLD,
      conditionMatchBonus: DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS,
      maxResults: DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS,
      aiSimilarityEnabled: false,
    });
  });

  describe("PHYSIO_ROUTINE_SIMILAR_THRESHOLD", () => {
    it.each([
      { raw: "0.33", expected: 0.33 },
      { raw: "0", expected: 0 },
      { raw: "1", expected: 1 },
    ])("accepts in-range override $raw", ({ raw, expected }) => {
      expect(
        resolveRoutineSimilarityConfig({ PHYSIO_ROUTINE_SIMILAR_THRESHOLD: raw })
          .threshold,
      ).toBe(expected);
    });

    it.each([
      { raw: "" },
      { raw: "   " },
      { raw: "nan" },
      { raw: "1.5" },
      { raw: "-0.01" },
      { raw: "2" },
    ])("falls back to default for invalid threshold $raw", ({ raw }) => {
      expect(
        resolveRoutineSimilarityConfig({ PHYSIO_ROUTINE_SIMILAR_THRESHOLD: raw })
          .threshold,
      ).toBe(DEFAULT_ROUTINE_SIMILAR_THRESHOLD);
    });
  });

  describe("PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS", () => {
    it.each([
      { raw: "0.25", expected: 0.25 },
      { raw: "0", expected: 0 },
      { raw: "1", expected: 1 },
    ])("accepts in-range override $raw", ({ raw, expected }) => {
      expect(
        resolveRoutineSimilarityConfig({ PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS: raw })
          .conditionMatchBonus,
      ).toBe(expected);
    });

    it.each([{ raw: "" }, { raw: "Infinity" }, { raw: "1.01" }, { raw: "-1" }])(
      "falls back to default for invalid bonus $raw",
      ({ raw }) => {
        expect(
          resolveRoutineSimilarityConfig({
            PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS: raw,
          }).conditionMatchBonus,
        ).toBe(DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS);
      },
    );
  });

  describe("PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS", () => {
    it.each([
      { raw: "10", expected: 10 },
      { raw: "1", expected: 1 },
      { raw: "20", expected: 20 },
    ])("accepts in-range override $raw", ({ raw, expected }) => {
      expect(
        resolveRoutineSimilarityConfig({ PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS: raw })
          .maxResults,
      ).toBe(expected);
    });

    it.each([{ raw: "" }, { raw: "0" }, { raw: "21" }, { raw: "3.5" }, { raw: "abc" }])(
      "falls back to default for invalid max results $raw",
      ({ raw }) => {
        expect(
          resolveRoutineSimilarityConfig({ PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS: raw })
            .maxResults,
        ).toBe(DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS);
      },
    );
  });
});

describe("resolveNodePhysioServerConfig routine similarity env", () => {
  it("applies valid env overrides and falls back on invalid values", () => {
    const config = resolveNodePhysioServerConfig({
      ...NODE_SIMILAR_FIXTURE,
      PHYSIO_ROUTINE_SIMILAR_THRESHOLD: "0.33",
      PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS: "0.2",
      PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS: "12",
    });
    expect(config.routineSimilarity.threshold).toBe(0.33);
    expect(config.routineSimilarity.conditionMatchBonus).toBe(0.2);
    expect(config.routineSimilarity.maxResults).toBe(12);
  });

  it("falls back per field when env values are out of range", () => {
    const config = resolveNodePhysioServerConfig({
      ...NODE_SIMILAR_FIXTURE,
      PHYSIO_ROUTINE_SIMILAR_THRESHOLD: "2",
      PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS: "bad",
      PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS: "99",
    });
    expect(config.routineSimilarity).toMatchObject({
      threshold: DEFAULT_ROUTINE_SIMILAR_THRESHOLD,
      conditionMatchBonus: DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS,
      maxResults: DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS,
    });
  });
});

describe("resolveWorkerPhysioServerConfig routine similarity env", () => {
  it("applies valid env overrides and falls back on invalid values", () => {
    const valid = resolveWorkerPhysioServerConfig(
      buildWorkerProductionAuthEnv({
        PHYSIO_ROUTINE_SIMILAR_THRESHOLD: "0.33",
        PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS: "0.2",
        PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS: "12",
      }),
    );
    expect(valid.routineSimilarity.threshold).toBe(0.33);
    expect(valid.routineSimilarity.conditionMatchBonus).toBe(0.2);
    expect(valid.routineSimilarity.maxResults).toBe(12);

    const invalid = resolveWorkerPhysioServerConfig(
      buildWorkerProductionAuthEnv({
        PHYSIO_ROUTINE_SIMILAR_THRESHOLD: "1.5",
        PHYSIO_ROUTINE_SIMILAR_CONDITION_BONUS: "-0.1",
        PHYSIO_ROUTINE_SIMILAR_MAX_RESULTS: "0",
      }),
    );
    expect(invalid.routineSimilarity).toMatchObject({
      threshold: DEFAULT_ROUTINE_SIMILAR_THRESHOLD,
      conditionMatchBonus: DEFAULT_ROUTINE_SIMILAR_CONDITION_BONUS,
      maxResults: DEFAULT_ROUTINE_SIMILAR_MAX_RESULTS,
    });
  });
});
