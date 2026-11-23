import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { EXERCISE_DRAFT_AI_JSON_SCHEMA } from "../src/adapters/deepinfra/exercise-draft-ai-schema.js";
import { EXERCISE_DRAFT_SYSTEM_PROMPT } from "../src/adapters/deepinfra/exercise-draft-system-prompt.js";
import {
  buildEndImagePrompt,
  type ExerciseMediaPromptContext,
} from "../src/domain/exercise-media-prompts.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import { MAX_LENGTH_EXERCISE_TEMPLATE_TEXT } from "../src/mcp-connector/text-limits.js";
import { ExerciseVersionsRepository } from "../src/storage/repositories/exercise-data.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  PINNED_EXERCISE_DRAFT_JSON_SCHEMA,
  PINNED_EXERCISE_DRAFT_SYSTEM_PROMPT,
} from "./fixtures/pinned-deepinfra-exercise-draft-literals.js";
import {
  openMigratedDatabase,
  seedDraftingExerciseRequest,
  seedExercise,
  seedPractitioner,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { fakeExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";
import { id } from "./helpers/opaque-test-ids.js";

const MOVEMENT_ONLY =
  "The ending_position must describe the end pose of only the body parts involved in the exercise's movement; every other body part stays as in the starting_position.";

const END_EDIT_VERBATIM =
  "Change only the body parts that this exercise moves; keep every other body part exactly as in the start image.";

describe("DIDI-1283 ending_position", () => {
  it("pins schema required ending_position after starting_position", () => {
    const required = EXERCISE_DRAFT_AI_JSON_SCHEMA.required;
    const startIdx = required.indexOf("starting_position");
    const endIdx = required.indexOf("ending_position");
    expect(startIdx).toBeGreaterThanOrEqual(0);
    expect(endIdx).toBe(startIdx + 1);
    expect(EXERCISE_DRAFT_AI_JSON_SCHEMA.properties.ending_position.maxLength).toBe(
      MAX_LENGTH_EXERCISE_TEMPLATE_TEXT,
    );
    expect(PINNED_EXERCISE_DRAFT_JSON_SCHEMA.required.indexOf("ending_position")).toBe(
      PINNED_EXERCISE_DRAFT_JSON_SCHEMA.required.indexOf("starting_position") + 1,
    );
  });

  it("pins system prompt movement-only constraint", () => {
    expect(EXERCISE_DRAFT_SYSTEM_PROMPT).toContain(MOVEMENT_ONLY);
    expect(PINNED_EXERCISE_DRAFT_SYSTEM_PROMPT).toContain(MOVEMENT_ONLY);
    expect(EXERCISE_DRAFT_SYSTEM_PROMPT).toContain("ending_position");
  });

  it("buildEndImagePrompt prefers ending_position and uses ec7689e8 wording", () => {
    const withEnding = buildEndImagePrompt({
      title: "Heel slide",
      startingPosition: "Supine, knee extended.",
      endingPosition: "Knee bent, heel near buttock.",
      steps: "1. Bend the knee.",
    });
    expect(withEnding).toContain("Knee bent, heel near buttock.");
    expect(withEnding).toContain(END_EDIT_VERBATIM);
    expect(withEnding).not.toContain("Supine, knee extended.");

    const fallback = buildEndImagePrompt({
      title: "Heel slide",
      startingPosition: "Supine.",
      steps: "1. Bend the knee toward the buttock.",
    });
    expect(fallback).toContain("Bend the knee toward the buttock");
    expect(fallback).not.toMatch(/starting position/i);
  });

  it("PATCH accepts and validates ending_position on draft", async () => {
    const storage = await openMigratedDatabase();
    const versions = new ExerciseVersionsRepository(storage);
    const practitioner = await seedPractitioner(
      storage,
      id("pr-d1283"),
      "d1283@example.com",
    );
    const exerciseId = await seedExercise(storage, practitioner, id("ex-d1283"));
    await versions.insert({
      id: id("ver-d1283"),
      exerciseId,
      versionNumber: 1,
      status: "draft",
      approvedBy: null,
      approvedAt: null,
      title: "Test",
      createdAt: new Date().toISOString(),
    });
    const ok = await versions.updateDraftFields(id("ver-d1283"), {
      endingPosition: "Heel drawn in.",
    });
    expect(ok).toBe(true);
    const tooLong = "x".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 1);
    await expect(
      versions.updateDraftFields(id("ver-d1283"), { endingPosition: tooLong }),
    ).rejects.toThrow();
  });

  it("promptContextFromVersion wiring uses stored ending_position in end prompt", () => {
    const ctx: ExerciseMediaPromptContext = {
      title: "Bridge",
      startingPosition: "Supine",
      endingPosition: "Hips lifted, knees bent.",
      steps: "1. Lift hips.",
    };
    const prompt = buildEndImagePrompt(ctx);
    expect(prompt).toContain("Hips lifted, knees bent.");
  });

  it("saving ending_position on draft does not call image generation", async () => {
    const storage = await openMigratedDatabase();
    const practitioner = await seedPractitioner(
      storage,
      id("pr-d1283b"),
      "b@example.com",
    );
    const requestId = id("req-d1283b");
    const exerciseId = await seedExercise(storage, practitioner, id("ex-d1283b"));
    const versionId = id("ver-d1283b");
    await storage.run(
      VERSION_INSERT_SQL,
      versionInsertBindings({
        id: versionId,
        exercise_id: exerciseId,
        title: "Heel slide",
        starting_position: "Supine",
        ending_position: "",
      }),
    );
    await seedDraftingExerciseRequest(storage, {
      requestId,
      practitionerId: practitioner,
      requestedName: "Heel slide",
    });
    await storage.run("UPDATE exercise_requests SET exercise_id = ? WHERE id = ?", [
      exerciseId,
      requestId,
    ]);

    const genSpy = vi.spyOn(
      ExerciseMediaService.prototype,
      "generateInitialMediaForVersion",
    );
    const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
      draftGenerator: fakeExerciseDraftGenerator,
    });
    await service.updateDraft({
      practitionerId: practitioner,
      requestId,
      patch: { ending_position: "Knee bent." },
    });
    expect(genSpy).not.toHaveBeenCalled();
    genSpy.mockRestore();
  });

  it("migration file ends with newline", () => {
    const sql = readFileSync(
      join(
        import.meta.dirname,
        "../migrations/0016_exercise_version_ending_position.sql",
      ),
      "utf8",
    );
    expect(sql.endsWith("\n")).toBe(true);
  });
});
