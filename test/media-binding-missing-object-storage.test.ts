import { describe, expect, it } from "vitest";
import {
  MEDIA_STORAGE_UNAVAILABLE_BODY,
  MediaBindingMissingObjectStorage,
  MediaStorageUnavailableError,
  isMediaBindingMissingObjectStorage,
  isMediaStorageUnavailableError,
} from "../src/adapters/workers/media-binding-missing-object-storage.js";

describe("MediaBindingMissingObjectStorage (DIDI-1040 B2)", () => {
  it("rejects put/get/head/delete with a typed media_storage_unavailable error (no env in message)", async () => {
    const storage = new MediaBindingMissingObjectStorage();
    expect(isMediaBindingMissingObjectStorage(storage)).toBe(true);
    await expect(
      storage.put("any/key", new Uint8Array([1]), "image/png"),
    ).rejects.toThrow(MediaStorageUnavailableError);
    await expect(storage.get("any/key")).rejects.toThrow(MediaStorageUnavailableError);
    await expect(storage.head("any/key")).rejects.toThrow(MediaStorageUnavailableError);
    await expect(storage.delete("any/key")).rejects.toThrow(
      MediaStorageUnavailableError,
    );
    try {
      await storage.get("any/key");
    } catch (error) {
      expect(isMediaStorageUnavailableError(error)).toBe(true);
      expect((error as MediaStorageUnavailableError).code).toBe(
        "media_storage_unavailable",
      );
      expect((error as Error).message).toBe("media_storage_unavailable");
      expect(JSON.stringify(error)).not.toMatch(/PHYSIO|account|binding/i);
    }
    expect(MEDIA_STORAGE_UNAVAILABLE_BODY).toBe(
      '{"error":"media_storage_unavailable"}',
    );
  });

  it("put rejects and stores nothing", async () => {
    const storage = new MediaBindingMissingObjectStorage();
    await expect(
      storage.put("public/obj.png", new Uint8Array([9, 9, 9]), "image/png"),
    ).rejects.toThrow(MediaStorageUnavailableError);
    await expect(storage.get("public/obj.png")).rejects.toThrow(
      MediaStorageUnavailableError,
    );
  });
});
