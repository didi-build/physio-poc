import type { ObjectStoragePort, StoredObject } from "../../ports/object-storage.js";

export class InMemoryObjectStorage implements ObjectStoragePort {
  private readonly objects = new Map<string, StoredObject>();

  async put(key: string, body: Uint8Array, contentType: string): Promise<void> {
    this.objects.set(key, { body: new Uint8Array(body), contentType });
  }

  async get(key: string): Promise<StoredObject | null> {
    const value = this.objects.get(key);
    if (!value) {
      return null;
    }
    return { body: new Uint8Array(value.body), contentType: value.contentType };
  }

  async delete(key: string): Promise<void> {
    this.objects.delete(key);
  }
}
