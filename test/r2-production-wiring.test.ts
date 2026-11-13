import { describe, expect, it } from "vitest";
import { createWorkerProductionAppDependencies } from "../src/adapters/workers/create-worker-production-app-dependencies.js";
import { buildWorkerProductionAuthEnv } from "./helpers/worker-production-auth-test-utils.js";
import {
  d1DatabaseFromSqlite,
  openWorkerAuthTestDatabase,
} from "./helpers/worker-auth-d1-fixture.js";
import { createFakeR2Bucket } from "./helpers/fake-r2-bucket.js";
import { R2ObjectStorage } from "../src/adapters/workers/r2-object-storage.js";

describe("Production R2 object storage wiring (DIDI-1040)", () => {
  it("persists and reads bytes through production deps PHYSIO_MEDIA", async () => {
    const { storage } = await openWorkerAuthTestDatabase();
    try {
      const d1 = d1DatabaseFromSqlite(storage.nativeDatabase());
      const bucket = createFakeR2Bucket();
      const env = buildWorkerProductionAuthEnv({ PHYSIO_DB: d1, PHYSIO_MEDIA: bucket });
      const deps = createWorkerProductionAppDependencies(env);
      expect(deps.objects).toBeInstanceOf(R2ObjectStorage);
      const key = "public/media/production-wiring.bin";
      const body = new TextEncoder().encode("production-r2-wiring");
      await deps.objects.put(key, body, "application/octet-stream");
      const roundTrip = await deps.objects.get(key);
      expect(new TextDecoder().decode(roundTrip?.body)).toBe("production-r2-wiring");
    } finally {
      storage.close();
    }
  });
});
