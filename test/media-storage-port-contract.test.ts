import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import { R2ObjectStorage } from "../src/adapters/workers/r2-object-storage.js";
import { createFakeR2Bucket } from "./helpers/fake-r2-bucket.js";
import { defineMediaStoragePortContract } from "./helpers/media-storage-port-contract.js";

defineMediaStoragePortContract(
  "in-memory PrefixMediaStorage",
  () => new PrefixMediaStorage(new InMemoryObjectStorage()),
);

defineMediaStoragePortContract(
  "R2 PrefixMediaStorage",
  () => new PrefixMediaStorage(new R2ObjectStorage(createFakeR2Bucket())),
);
