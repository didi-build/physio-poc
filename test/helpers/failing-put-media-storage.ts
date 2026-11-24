import type { MediaVisibility } from "../../src/storage/ports/media-storage.js";
import { PrefixMediaStorage } from "../../src/storage/adapters/memory/prefix-media-storage.js";
import type { ObjectStoragePort } from "../../src/storage/ports/object-storage.js";

/** Fails putImage once (for regeneration quota-after-save tests). */
export class FailingPutMediaStorage extends PrefixMediaStorage {
  private puts = 0;

  constructor(
    objects: ObjectStoragePort,
    /** Fail on the first put after this many successful puts (initial draft uses two). */
    private readonly failAfterSuccessfulPuts = 2,
  ) {
    super(objects);
  }

  override async putImage(
    objectKey: string,
    bytes: Uint8Array,
    contentType: string,
    visibility: MediaVisibility,
  ): Promise<void> {
    this.puts += 1;
    if (this.puts > this.failAfterSuccessfulPuts) {
      throw new Error("simulated R2 save failure");
    }
    return super.putImage(objectKey, bytes, contentType, visibility);
  }
}
