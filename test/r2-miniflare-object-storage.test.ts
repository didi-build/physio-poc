import { afterEach, describe, expect, it } from "vitest";
import { createTestHarness, type TestHarness } from "wrangler";
import { join } from "node:path";
import { R2ObjectStorage } from "../src/adapters/workers/r2-object-storage.js";
import { PHYSIO_R2_BINDING } from "../scripts/lib/wrangler-r2-binding.mjs";
import { writeHarnessWranglerConfigWithProductionBindings } from "./helpers/wrangler-harness-config.js";
import { ensureWranglerUiAssetsDirectory } from "./helpers/wrangler-ui-assets-fixture.js";

const REPO_ROOT = join(import.meta.dirname, "..");

describe("R2ObjectStorage (miniflare harness)", () => {
  let server: TestHarness | undefined;
  let harnessConfig:
    ReturnType<typeof writeHarnessWranglerConfigWithProductionBindings> | undefined;

  afterEach(async () => {
    if (server) {
      await server.close();
      server = undefined;
    }
    harnessConfig?.cleanup();
    harnessConfig = undefined;
  });

  it("reads bytes via arrayBuffer() on the R2 object, not body.arrayBuffer()", async () => {
    ensureWranglerUiAssetsDirectory();
    harnessConfig = writeHarnessWranglerConfigWithProductionBindings();
    server = createTestHarness({
      root: REPO_ROOT,
      workers: [{ configPath: harnessConfig.configPath }],
    });
    await server.listen();
    const worker = server.getWorker<Record<string, unknown>>();
    const env = await worker.getEnv();
    const bucket = env[PHYSIO_R2_BINDING];
    expect(bucket).toBeDefined();
    const storage = new R2ObjectStorage(bucket as never);
    const body = new TextEncoder().encode("miniflare-r2-bytes");
    await storage.put("public/miniflare-test.bin", body, "application/octet-stream");
    const roundTrip = await storage.get("public/miniflare-test.bin");
    expect(roundTrip?.contentType).toBe("application/octet-stream");
    expect(new TextDecoder().decode(roundTrip?.body)).toBe("miniflare-r2-bytes");
  });
});
