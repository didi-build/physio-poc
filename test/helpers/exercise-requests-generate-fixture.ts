import { expect } from "vitest";
import { ExerciseMediaService } from "../../src/services/exercise-media/exercise-media-service.js";
import { ExerciseRequestsService } from "../../src/services/exercise-requests/exercise-requests-service.js";
import { InMemoryObjectStorage } from "../../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeImageGeneration } from "../../src/storage/adapters/memory/fake-image-generation.js";
import { PrefixMediaStorage } from "../../src/storage/adapters/memory/prefix-media-storage.js";
import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";

export function testExerciseMediaService(
  storage: SqlStoragePort,
): ExerciseMediaService {
  return new ExerciseMediaService(
    storage,
    new FakeImageGeneration(),
    new PrefixMediaStorage(new InMemoryObjectStorage()),
  );
}

export async function submitRequestWithGeneratedDraft(
  service: ExerciseRequestsService,
  storage: SqlStoragePort,
  input: Parameters<ExerciseRequestsService["submitRequest"]>[0],
) {
  const created = await service.submitRequest(input);
  if (created.outcome !== "created") {
    return created;
  }
  const generated = await service.generateRequest({
    practitionerId: input.practitionerId,
    requestId: created.request_id,
    mediaService: testExerciseMediaService(storage),
  });
  expect(generated.outcome).toBe("complete");
  const row = await storage.first<{ exercise_id: string | null }>(
    "SELECT exercise_id FROM exercise_requests WHERE id = ? LIMIT 1",
    [created.request_id],
  );
  const exerciseId =
    (generated.outcome === "complete" ? generated.view?.exercise_id : null) ??
    row?.exercise_id ??
    created.exercise_id;
  return { ...created, exercise_id: exerciseId };
}
