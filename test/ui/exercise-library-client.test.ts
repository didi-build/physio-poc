/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ExerciseLibraryClient } from "../../src/ui/api/exercise-library-client.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("exercise-library-client", () => {
  it("sends application/json on DELETE for my-exercises", async () => {
    const fetchFn = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ undo: {} }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    const client = new ExerciseLibraryClient({ practitionerId: "pract-1", fetchFn });
    await client.removeFromMyExercises("ex-1");
    expect(fetchFn).toHaveBeenCalledWith(
      "/api/practitioners/pract-1/my-exercises/ex-1",
      {
        method: "DELETE",
        headers: { "content-type": "application/json" },
      },
    );
  });
});
