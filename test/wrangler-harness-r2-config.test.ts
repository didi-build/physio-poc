import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PHYSIO_PRODUCTION_R2_BUCKETS } from "../scripts/lib/wrangler-r2-binding.mjs";
import {
  assertHarnessR2BucketsAreLocalOnly,
  writeHarnessWranglerConfigWithProductionBindings,
} from "./helpers/wrangler-harness-config.js";

describe("Wrangler harness physio-media R2 (B1 / DIDI-1040)", () => {
  it("keeps the harness binding local/simulated with no remote bucket or account", () => {
    assertHarnessR2BucketsAreLocalOnly(
      PHYSIO_PRODUCTION_R2_BUCKETS as readonly Record<string, unknown>[],
    );
    for (const entry of PHYSIO_PRODUCTION_R2_BUCKETS) {
      expect(entry).not.toHaveProperty("remote");
      expect(entry).not.toHaveProperty("account_id");
    }

    const fixture = writeHarnessWranglerConfigWithProductionBindings();
    try {
      const text = readFileSync(fixture.configPath, "utf8");
      expect(text).not.toMatch(/"remote"\s*:\s*true/);
      expect(text).toContain('"bucket_name": "physio-media"');
    } finally {
      fixture.cleanup();
    }
  });
});
