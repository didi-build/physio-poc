import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHYSIO_PRODUCTION_R2_BUCKETS } from "../scripts/lib/wrangler-r2-binding.mjs";
import { PHYSIO_HARNESS_R2_BUCKETS } from "../scripts/lib/wrangler-harness-r2-binding.mjs";
import {
  assertHarnessR2BucketsAreLocalOnly,
  assertHarnessR2BucketsAreNotProductionBucketNames,
  PHYSIO_HARNESS_R2_BUCKET_NAME,
  writeHarnessWranglerConfigWithHarnessBindings,
} from "./helpers/wrangler-harness-config.js";

describe("Wrangler harness physio-media R2 (B1 / DIDI-1040)", () => {
  it("keeps the harness binding local/simulated with no remote bucket or account", () => {
    assertHarnessR2BucketsAreLocalOnly(
      PHYSIO_HARNESS_R2_BUCKETS as readonly Record<string, unknown>[],
    );
    assertHarnessR2BucketsAreNotProductionBucketNames(
      PHYSIO_HARNESS_R2_BUCKETS,
      PHYSIO_PRODUCTION_R2_BUCKETS.map((entry) => entry.bucket_name),
    );
    for (const entry of PHYSIO_HARNESS_R2_BUCKETS) {
      expect(entry).not.toHaveProperty("remote");
      expect(entry).not.toHaveProperty("account_id");
      expect(entry.bucket_name).toBe(PHYSIO_HARNESS_R2_BUCKET_NAME);
      expect(entry.bucket_name).not.toBe(PHYSIO_PRODUCTION_R2_BUCKETS[0]!.bucket_name);
    }

    const fixture = writeHarnessWranglerConfigWithHarnessBindings();
    try {
      const text = readFileSync(fixture.configPath, "utf8");
      expect(text).not.toMatch(/"remote"\s*:\s*true/);
      expect(text).toContain(`"bucket_name": "${PHYSIO_HARNESS_R2_BUCKET_NAME}"`);
      expect(text).not.toContain('"bucket_name": "physio-media"');
    } finally {
      fixture.cleanup();
    }
  });
});
