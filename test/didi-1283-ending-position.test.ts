import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import { FreeTextValidationError } from "../src/domain/exercise-free-text.js";
import { buildTextOverrideEntry } from "../src/domain/exercise-text-overrides.js";
import { ExerciseLibraryService } from "../src/services/exercise-library/exercise-library-service.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import {
  ProgramPublishService,
  type PublicShareLinkOpenView,
} from "../src/services/programs/program-publish-service.js";
import { publicShareLinkApiPath } from "../src/programs-api-paths.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { EXERCISE_DRAFT_AI_JSON_SCHEMA } from "../src/adapters/deepinfra/exercise-draft-ai-schema.js";
import { EXERCISE_DRAFT_SYSTEM_PROMPT } from "../src/adapters/deepinfra/exercise-draft-system-prompt.js";
import {
  buildEndImagePrompt,
  type ExerciseMediaPromptContext,
} from "../src/domain/exercise-media-prompts.js";
import { MAX_LENGTH_EXERCISE_TEMPLATE_TEXT } from "../src/mcp-connector/text-limits.js";
import { ExerciseVersionsRepository } from "../src/storage/repositories/exercise-data.js";
import { ExerciseRequestsService } from "../src/services/exercise-requests/exercise-requests-service.js";
import {
  PINNED_EXERCISE_DRAFT_JSON_SCHEMA,
  PINNED_EXERCISE_DRAFT_SYSTEM_PROMPT,
} from "./fixtures/pinned-deepinfra-exercise-draft-literals.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedDraftingExerciseRequest,
  seedExercise,
  seedPractitioner,
  TS,
  VERSION_INSERT_SQL,
  versionInsertBindings,
} from "./helpers/exercise-sqlite-fixture.js";
import { submitRequestWithGeneratedDraft } from "./helpers/exercise-requests-generate-fixture.js";
import { createTestPhysioMcpHttpHandler } from "./mcp-server-test-utils.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { fakeExerciseDraftGenerator } from "../src/services/exercise-requests/fake-draft-generator.js";
import { id } from "./helpers/opaque-test-ids.js";

const MOVEMENT_ONLY =
  "The ending_position must describe the end pose of only the body parts involved in the exercise's movement; every other body part stays as in the starting_position.";

const END_EDIT_VERBATIM =
  "Change only the body parts that this exercise moves; keep every other body part exactly as in the start image.";

const DISTINCT_START = "DISTINCT_START_D1283_UNIQUE";
const LAST_MOVE_STEP = "Bend the knee toward the buttock.";
const FAKE_DOB_SNIPPET = "DOB 1990-01-01";

const VALID_REDIRECT_DRAFT = {
  title: "Heel slide",
  aliases: ["Heel slides"],
  category: "stretch",
  body_regions: ["knee"],
  description: "Gentle knee flexion stretch.",
  equipment: "Mat",
  starting_position: "Supine on mat.",
  ending_position: "Knee deeply flexed after redraft.",
  steps: "1. Bend knee\n2. Slide heel",
  common_mistakes: "Rushing",
  regressions: "Smaller range",
  progressions: "Hold longer",
  precautions: "Stop if pain",
  cue_stretching: "Move slowly",
  cue_isometric: null,
  cue_concentric: null,
  cue_eccentric: null,
} as const;

function envelope(content: string): Response {
  return new Response(
    JSON.stringify({
      choices: [{ message: { content } }],
    }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

const BASE = "https://physio.test.example";
const WEB_BASE = MCP_TEST_CONFIG.webAppBaseUrl;
const FORM_OPENED = "2026-10-30T10:00:00.000Z";

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

  it("buildEndImagePrompt with empty ending_position uses last step and pins ec7689e8 wording", () => {
    const prompt = buildEndImagePrompt({
      title: "Heel slide",
      startingPosition: DISTINCT_START,
      endingPosition: "",
      steps: `1. ${LAST_MOVE_STEP}\n2. Return to start`,
    });
    expect(prompt).toContain(
      `Same figure, clothing, camera angle, background and lighting. Change only the pose to the end position: ${LAST_MOVE_STEP}.`,
    );
    expect(prompt).toContain(END_EDIT_VERBATIM);
    expect(prompt).not.toContain(DISTINCT_START);
    expect(prompt).not.toMatch(/starting position/i);
  });

  it("stores ending_position on new draft and redraft (DeepInfra, fetch stubbed)", async () => {
    const newEnding = "Knee bent with heel slid toward the hip.";
    const regenEnding = "Knee deeply flexed after redraft.";
    const storage = await openMigratedDatabase();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        envelope(
          JSON.stringify({ ...VALID_REDIRECT_DRAFT, ending_position: newEnding }),
        ),
      )
      .mockResolvedValueOnce(
        envelope(
          JSON.stringify({ ...VALID_REDIRECT_DRAFT, ending_position: regenEnding }),
        ),
      );
    const generator = createDeepInfraExerciseDraftGenerator({ apiKey: "k", fetchImpl });
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-d1283-new"),
        "new@example.com",
      );
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: generator,
      });
      const created = await submitRequestWithGeneratedDraft(
        service,
        storage,
        {
          practitionerId: practitioner,
          requestedName: "Heel slide",
          exerciseNote: null,
          formOpenedAt: FORM_OPENED,
        },
        { draftGenerator: generator },
      );
      expect(created.outcome).toBe("created");
      if (created.outcome !== "created") {
        throw new Error("expected created");
      }
      const exerciseId = (
        await storage.first<{ exercise_id: string }>(
          "SELECT exercise_id FROM exercise_requests WHERE id = ?",
          [created.request_id],
        )
      )?.exercise_id;
      if (!exerciseId) {
        throw new Error("expected exercise_id after generate");
      }
      const afterNew = await storage.first<{ ending_position: string }>(
        "SELECT ending_position FROM exercise_versions WHERE exercise_id = ?",
        [exerciseId],
      );
      expect(afterNew?.ending_position).toBe(newEnding);
      const genResult = await service.regenerateDraftText({
        practitionerId: practitioner,
        requestId: created.request_id,
        note: "refresh text",
      });
      expect(genResult.outcome).toBe("complete");
      const afterRegen = await storage.first<{ ending_position: string }>(
        "SELECT ending_position FROM exercise_versions WHERE exercise_id = ?",
        [exerciseId],
      );
      expect(afterRegen?.ending_position).toBe(regenEnding);
      expect(fetchImpl).toHaveBeenCalledTimes(2);
    } finally {
      storage.close();
    }
  });

  it("rejects ending_position length and free text on draft PATCH", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-d1283-patch"),
        "patch@example.com",
      );
      const requestId = id("req-d1283-patch");
      const exerciseId = await seedExercise(
        storage,
        practitioner,
        id("ex-d1283-patch"),
      );
      const versionId = id("ver-d1283-patch");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          title: "Heel slide",
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
      const service = new ExerciseRequestsService(storage, MCP_TEST_CONFIG, {
        draftGenerator: fakeExerciseDraftGenerator,
      });
      const tooLong = "x".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 1);
      await expect(
        service.updateDraft({
          practitionerId: practitioner,
          requestId,
          patch: { ending_position: tooLong },
        }),
      ).rejects.toThrow();
      await expect(
        service.updateDraft({
          practitionerId: practitioner,
          requestId,
          patch: { ending_position: `Notes ${FAKE_DOB_SNIPPET}` },
        }),
      ).rejects.toThrow();
    } finally {
      storage.close();
    }
  });

  it("rejects ending_position length and free text on Edit my copy", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage, id("pr-mycopy-d1283"));
      await seedApprovedExerciseVersion(storage, practId);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyExercises(practId, FIXTURE_EXERCISE_ID);
      const tooLong = "y".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 1);
      await expect(
        service.updateMyCopy({
          practitionerId: practId,
          exerciseId: FIXTURE_EXERCISE_ID,
          textOverrides: { ending_position: tooLong },
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      await expect(
        service.updateMyCopy({
          practitionerId: practId,
          exerciseId: FIXTURE_EXERCISE_ID,
          textOverrides: { ending_position: `Hold. ${FAKE_DOB_SNIPPET}` },
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      expect(() =>
        buildTextOverrideEntry("ending_position", tooLong, "Library end"),
      ).toThrow();
      expect(() =>
        buildTextOverrideEntry(
          "ending_position",
          `x ${FAKE_DOB_SNIPPET}`,
          "Library end",
        ),
      ).toThrow(FreeTextValidationError);
    } finally {
      storage.close();
    }
  });

  it("persists ending_position override on Edit my copy without image generation", async () => {
    const storage = await openMigratedDatabase();
    const genSpy = vi.spyOn(
      ExerciseMediaService.prototype,
      "generateInitialMediaForVersion",
    );
    try {
      const practId = await seedPractitioner(storage, id("pr-mycopy-save"));
      await seedApprovedExerciseVersion(storage, practId);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyExercises(practId, FIXTURE_EXERCISE_ID);
      const mine = "Knee flexed, heel in.";
      await service.updateMyCopy({
        practitionerId: practId,
        exerciseId: FIXTURE_EXERCISE_ID,
        textOverrides: { ending_position: mine },
      });
      const details = await service.getExerciseDetails(practId, FIXTURE_EXERCISE_ID);
      const field = details.resolved_text.find((f) => f.key === "ending_position");
      expect(field?.resolved).toBe(mine);
      expect(genSpy).not.toHaveBeenCalled();
    } finally {
      genSpy.mockRestore();
      storage.close();
    }
  });

  it("public share link open rows carry pinned position text without step fallback", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage, id("pr-share-d1283"));
      await seedApprovedExerciseVersion(storage, practitionerId);
      const startPinned = "Supine with knee straight.";
      const endPinned = "Heel drawn toward hip.";
      const descriptionPinned = "Glute activation.";
      await storage.run(
        `UPDATE exercise_versions SET description = ?, starting_position = ?, ending_position = ?, steps = ?
         WHERE id = ?`,
        [descriptionPinned, startPinned, endPinned, LAST_MOVE_STEP, FIXTURE_VERSION_ID],
      );
      const programId = id("prog-d1283");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Rehab",
      });
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-d1283"),
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: { title: "Heel slide" },
        draftUpdatedAt: TS,
      });
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const published = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId,
          email: "share@example.com",
          displayName: "Coach",
        },
      });
      const response = await handleRequest(
        new Request(`${BASE}${publicShareLinkApiPath(token)}`),
        {
          sql: storage,
          objects,
          config: MCP_TEST_CONFIG,
          mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
          auth,
        },
      );
      const body = (await response.json()) as PublicShareLinkOpenView;
      expect(body.rows[0]?.starting_position).toBe(startPinned);
      expect(body.rows[0]?.ending_position).toBe(endPinned);
      expect(body.rows[0]?.description).toBe(descriptionPinned);
      expect(body.rows[0]?.ending_position).not.toBe(LAST_MOVE_STEP);
    } finally {
      storage.close();
    }
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
