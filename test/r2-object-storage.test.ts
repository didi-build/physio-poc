import { describe, expect, it } from "vitest";
import { R2ObjectStorage } from "../src/adapters/workers/r2-object-storage.js";
import { createFakeR2Bucket } from "./helpers/fake-r2-bucket.js";

describe("R2ObjectStorage (unit)", () => {
  it("put and get round-trip bytes and content-type", async () => {
    const storage = new R2ObjectStorage(createFakeR2Bucket());
    const body = new TextEncoder().encode("demo-bytes");
    await storage.put("media/exercise/demo.png", body, "image/png");
    const roundTrip = await storage.get("media/exercise/demo.png");
    expect(roundTrip?.contentType).toBe("image/png");
    expect(new TextDecoder().decode(roundTrip?.body)).toBe("demo-bytes");
  });

  it("returns null for a missing key on get", async () => {
    const storage = new R2ObjectStorage(createFakeR2Bucket());
    expect(await storage.get("missing/key.bin")).toBeNull();
  });

  it("head reports size and content-type for stored objects", async () => {
    const storage = new R2ObjectStorage(createFakeR2Bucket());
    const body = new TextEncoder().encode("abc");
    await storage.put("media/a.bin", body, "application/octet-stream");
    await expect(storage.head("media/a.bin")).resolves.toEqual({
      contentType: "application/octet-stream",
      size: 3,
    });
    expect(await storage.head("missing")).toBeNull();
  });

  it("delete removes stored objects", async () => {
    const storage = new R2ObjectStorage(createFakeR2Bucket());
    const body = new TextEncoder().encode("demo-bytes");
    await storage.put("media/exercise/demo.png", body, "image/png");
    await storage.delete("media/exercise/demo.png");
    expect(await storage.get("media/exercise/demo.png")).toBeNull();
  });
});
