import { describe, expect, it } from "vitest";
import {
  MEDIA_STORAGE_UNAVAILABLE_BODY,
  MediaBindingMissingObjectStorage,
  isMediaBindingMissingObjectStorage,
} from "../src/adapters/workers/media-binding-missing-object-storage.js";

describe("MediaBindingMissingObjectStorage (DIDI-1040 B2)", () => {
  it("fail-closes reads and exposes the authenticated-media unavailable body constant", async () => {
    const storage = new MediaBindingMissingObjectStorage();
    expect(isMediaBindingMissingObjectStorage(storage)).toBe(true);
    expect(await storage.get("any/key")).toBeNull();
    expect(MEDIA_STORAGE_UNAVAILABLE_BODY).toBe(
      '{"error":"media_storage_unavailable"}',
    );
  });
});
