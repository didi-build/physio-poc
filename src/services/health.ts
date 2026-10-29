import type { ObjectStoragePort } from "../storage/ports/object-storage.js";
import type { SqlStoragePort } from "../storage/ports/sql-storage.js";

export type HealthDependencies = {
  sql: SqlStoragePort;
  objects: ObjectStoragePort;
};

export type HealthPayload = {
  ok: true;
  service: "physio-poc";
};

export async function getHealth(deps: HealthDependencies): Promise<HealthPayload> {
  void deps;
  return { ok: true, service: "physio-poc" };
}
