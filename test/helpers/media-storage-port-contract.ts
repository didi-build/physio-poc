import { describe, expect, it } from "vitest";
import type { MediaStoragePort } from "../../src/storage/ports/media-storage.js";

export function defineMediaStoragePortContract(
  label: string,
  createStorage: () => MediaStoragePort,
): void {
  describe(`MediaStoragePort contract (${label})`, () => {
    it("does not expose draft objects via getPublicImage", async () => {
      const media = createStorage();
      await media.putImage("k/start.png", new Uint8Array([1]), "image/png", "draft");
      expect(await media.getPublicImage("k/start.png")).toBeNull();
      expect(await media.getImage("k/start.png", "draft")).not.toBeNull();
    });

    it("promotes draft start and end images to public visibility", async () => {
      const media = createStorage();
      const keys = {
        startObjectKey: "media/set/start.png",
        endObjectKey: "media/set/end.png",
      };
      await media.putImage(
        keys.startObjectKey,
        new Uint8Array([1, 2]),
        "image/png",
        "draft",
      );
      await media.putImage(
        keys.endObjectKey,
        new Uint8Array([3, 4]),
        "image/png",
        "draft",
      );
      expect(await media.getPublicImage(keys.startObjectKey)).toBeNull();

      await media.promoteDraftToPublic(keys);

      const startPublic = await media.getPublicImage(keys.startObjectKey);
      const endPublic = await media.getPublicImage(keys.endObjectKey);
      expect(startPublic?.contentType).toBe("image/png");
      expect(endPublic?.contentType).toBe("image/png");
      expect(startPublic?.body).toEqual(new Uint8Array([1, 2]));
      expect(endPublic?.body).toEqual(new Uint8Array([3, 4]));
      expect(await media.getImage(keys.startObjectKey, "draft")).toBeNull();
    });

    it("deleteDraftSet removes draft copies only", async () => {
      const media = createStorage();
      const keys = {
        startObjectKey: "media/set/start.png",
        endObjectKey: "media/set/end.png",
      };
      await media.putImage(
        keys.startObjectKey,
        new Uint8Array([9]),
        "image/png",
        "draft",
      );
      await media.putImage(
        keys.endObjectKey,
        new Uint8Array([8]),
        "image/png",
        "draft",
      );
      await media.deleteDraftSet(keys);
      expect(await media.getImage(keys.startObjectKey, "draft")).toBeNull();
      expect(await media.getImage(keys.endObjectKey, "draft")).toBeNull();
    });

    it("returns null from getPublicImage for a missing key", async () => {
      const media = createStorage();
      expect(await media.getPublicImage("missing/object.png")).toBeNull();
    });
  });
}
