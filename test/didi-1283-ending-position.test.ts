import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { createDeepInfraExerciseDraftGenerator } from "../src/adapters/deepinfra/deepinfra-exercise-draft-generator.js";
import { FreeTextValidationError } from "../src/domain/exercise-free-text.js";
import { buildTextOverrideEntry } from "../src/domain/exercise-text-overrides.js";
import { ExerciseLibraryService } from "../src/services/exercise-library/exercise-library-service.js";
import { ExerciseMediaService } from "../src/services/exercise-media/exercise-media-service.js";
import { FakeImageGeneration } from "../src/storage/adapters/memory/fake-image-generation.js";
import { PrefixMediaStorage } from "../src/storage/adapters/memory/prefix-media-storage.js";
import {
  ProgramPublishService,
  type PublicShareLinkOpenView,
} from "../src/services/programs/program-publish-service.js";
import { ProgramBuilderService } from "../src/services/programs/program-builder-service.js";
import {
  buildProgramRowTextSnapshot,
  resolvePatientTextFromProgramSnapshot,
} from "../src/services/programs/row-resolution.js";
import { parseAndValidateExerciseDraftAiPayload } from "../src/adapters/deepinfra/exercise-draft-ai-schema.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0005_ID,
  MIGRATION_0007_ID,
  MIGRATION_0008_ID,
  MIGRATION_0009_ID,
  MIGRATION_0011_ID,
  MIGRATION_0012_ID,
  MIGRATION_0013_ID,
  MIGRATION_0014_ID,
  MIGRATION_0015_ID,
  MIGRATION_0016_ID,
} from "../src/storage/migrations/apply.js";
import { BetterSqliteStorage } from "../src/adapters/node/better-sqlite-sql-storage.js";
import {
  MIGRATION_0015_SQL,
  MIGRATION_0016_SQL,
  MIGRATION_0001_SQL,
  MIGRATION_0002_SQL,
  MIGRATION_0003_SQL,
  MIGRATION_0005_SQL,
  MIGRATION_0007_SQL,
  MIGRATION_0008_SQL,
  MIGRATION_0009_SQL,
  MIGRATION_0011_SQL,
  MIGRATION_0012_SQL,
  MIGRATION_0013_SQL,
  MIGRATION_0014_SQL,
} from "./helpers/exercise-sqlite-fixture.js";
import { draftVersionNeedsTextRedraft } from "../src/services/exercise-requests/run-exercise-request-draft-generation.js";
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
    const view = await service.updateDraft({
      practitionerId: practitioner,
      requestId,
      patch: { ending_position: "Knee bent." },
    });
    expect(view.draft?.ending_position).toBe("Knee bent.");
    const stored = await storage.first<{ ending_position: string }>(
      "SELECT ending_position FROM exercise_versions WHERE id = ?",
      [versionId],
    );
    expect(stored?.ending_position).toBe("Knee bent.");
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

  it("allows trimmed empty ending_position override on Edit my copy", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage, id("pr-mycopy-empty"));
      await seedApprovedExerciseVersion(storage, practId);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyExercises(practId, FIXTURE_EXERCISE_ID);
      await service.updateMyCopy({
        practitionerId: practId,
        exerciseId: FIXTURE_EXERCISE_ID,
        textOverrides: { ending_position: "  \n\t  " },
      });
      const details = await service.getExerciseDetails(practId, FIXTURE_EXERCISE_ID);
      const field = details.resolved_text.find((f) => f.key === "ending_position");
      expect(field?.resolved).toBe("");
    } finally {
      storage.close();
    }
  });

  it("public share link rows use frozen snapshot text after the library version changes", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage, id("pr-frozen-d1283"));
      await seedApprovedExerciseVersion(storage, practitionerId);
      const frozenDescription = "Frozen description for patients.";
      const frozenStart = "Frozen starting pose.";
      const frozenEnd = "Frozen ending pose.";
      const programId = id("prog-frozen-d1283");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Frozen program",
      });
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-frozen-d1283"),
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: {
          title: "Heel slide",
          description: frozenDescription,
          starting_position: frozenStart,
          ending_position: frozenEnd,
        },
        draftUpdatedAt: TS,
      });
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const published = await publish.publishProgram(practitionerId, programId);
      await storage.run(
        `UPDATE exercise_versions SET description = ?, starting_position = ?, ending_position = ?
         WHERE id = ?`,
        ["Live description.", "Live start.", "Live end.", FIXTURE_VERSION_ID],
      );
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId,
          email: "frozen@example.com",
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
      expect(body.rows[0]?.description).toBe(frozenDescription);
      expect(body.rows[0]?.starting_position).toBe(frozenStart);
      expect(body.rows[0]?.ending_position).toBe(frozenEnd);
    } finally {
      storage.close();
    }
  });

  it("allows saving trimmed empty ending_position on draft PATCH", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-d1283-empty-patch"),
        "empty-patch@example.com",
      );
      const requestId = id("req-d1283-empty-patch");
      const exerciseId = await seedExercise(
        storage,
        practitioner,
        id("ex-d1283-empty-patch"),
      );
      const versionId = id("ver-d1283-empty-patch");
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
      const view = await service.updateDraft({
        practitionerId: practitioner,
        requestId,
        patch: { ending_position: "  \n  " },
      });
      expect(view.draft?.ending_position).toBe("");
    } finally {
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

  it("Q1: My copy overrides for description and positions reach the public share link", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage, id("pr-q1-mycopy"));
      await seedApprovedExerciseVersion(storage, practitionerId);
      await storage.run(
        `UPDATE exercise_versions SET description = ?, starting_position = ?, ending_position = ?
         WHERE id = ?`,
        [
          "Library description.",
          "Library starting position.",
          "Library ending position.",
          FIXTURE_VERSION_ID,
        ],
      );
      const library = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await library.saveToMyExercises(practitionerId, FIXTURE_EXERCISE_ID);
      const myDesc = "Patient-facing description from my copy.";
      const myStart = "Patient-facing starting from my copy.";
      const myEnd = "Patient-facing ending from my copy.";
      await library.updateMyCopy({
        practitionerId,
        exerciseId: FIXTURE_EXERCISE_ID,
        textOverrides: {
          description: myDesc,
          starting_position: myStart,
          ending_position: myEnd,
        },
      });
      const programId = id("prog-q1-mycopy");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "My copy program",
      });
      const builder = new ProgramBuilderService(storage, () => TS);
      await builder.addExerciseRow(practitionerId, programId, {
        rowId: id("row-q1-mycopy"),
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
      });
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const published = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId,
          email: "q1@example.com",
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
      expect(body.rows[0]?.description).toBe(myDesc);
      expect(body.rows[0]?.starting_position).toBe(myStart);
      expect(body.rows[0]?.ending_position).toBe(myEnd);
    } finally {
      storage.close();
    }
  });

  it("Q1: frozen empty saved ending does not fall back to pinned version on public link", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage, id("pr-q1-empty"));
      await seedApprovedExerciseVersion(storage, practitionerId);
      const pinnedEnd = "Pinned ending should not appear.";
      await storage.run(
        `UPDATE exercise_versions SET ending_position = ? WHERE id = ?`,
        [pinnedEnd, FIXTURE_VERSION_ID],
      );
      const programId = id("prog-q1-empty");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Empty ending frozen",
      });
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-q1-empty"),
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: {
          title: "Heel slide",
          description: "Desc kept.",
          starting_position: "Start kept.",
          ending_position: "",
        },
        draftUpdatedAt: TS,
      });
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const published = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId,
          email: "empty@example.com",
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
      expect(body.rows[0]?.ending_position).toBe("");
      expect(body.rows[0]?.ending_position).not.toBe(pinnedEnd);
    } finally {
      storage.close();
    }
  });

  it("Q1: buildProgramRowTextSnapshot always carries description, starting_position, and ending_position", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage, id("pr-q1-keys"));
      await seedApprovedExerciseVersion(storage, practitionerId);
      await storage.run(
        `UPDATE exercise_versions SET description = ?, starting_position = ?, ending_position = ? WHERE id = ?`,
        ["Lib desc.", "Lib start.", "Lib end.", FIXTURE_VERSION_ID],
      );
      const version = await storage.first<{
        title: string;
        description: string;
        starting_position: string;
        ending_position: string;
        cue_stretching: string | null;
        cue_isometric: string | null;
        cue_concentric: string | null;
        cue_eccentric: string | null;
      }>(
        `SELECT title, description, starting_position, ending_position,
                cue_stretching, cue_isometric, cue_concentric, cue_eccentric
         FROM exercise_versions WHERE id = ?`,
        [FIXTURE_VERSION_ID],
      );
      if (!version) {
        throw new Error("missing version");
      }
      const snapshot = buildProgramRowTextSnapshot({
        version: version as Parameters<
          typeof buildProgramRowTextSnapshot
        >[0]["version"],
        overrides: {},
        prescriptionType: "stretching",
      });
      expect(snapshot).toHaveProperty("description", "Lib desc.");
      expect(snapshot).toHaveProperty("starting_position", "Lib start.");
      expect(snapshot).toHaveProperty("ending_position", "Lib end.");
    } finally {
      storage.close();
    }
  });

  it("Q1: a library version edit after publish does not change sent program patient text", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage, id("pr-q1-after"));
      await seedApprovedExerciseVersion(storage, practitionerId);
      const frozen = "Still frozen after library bump.";
      await storage.run(
        `UPDATE exercise_versions SET ending_position = ? WHERE id = ?`,
        [frozen, FIXTURE_VERSION_ID],
      );
      const programId = id("prog-q1-after");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "After bump",
      });
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-q1-after"),
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: {
          title: "Heel slide",
          description: "D",
          starting_position: "S",
          ending_position: frozen,
        },
        draftUpdatedAt: TS,
      });
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const published = await publish.publishProgram(practitionerId, programId);
      await storage.run(
        `UPDATE exercise_versions SET ending_position = ? WHERE id = ?`,
        ["Library bumped ending must not appear.", FIXTURE_VERSION_ID],
      );
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId,
          email: "after@example.com",
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
      expect(body.rows[0]?.ending_position).toBe(frozen);
      expect(body.rows[0]?.ending_position).not.toBe(
        "Library bumped ending must not appear.",
      );
    } finally {
      storage.close();
    }
  });

  it("Q3: draftVersionNeedsTextRedraft ignores empty ending_position alone", () => {
    expect(
      draftVersionNeedsTextRedraft({
        description: "Ready description.",
        starting_position: "Ready start.",
        steps: "1. Step one",
      }),
    ).toBe(false);
    expect(
      draftVersionNeedsTextRedraft({
        description: "",
        starting_position: "Ready start.",
        steps: "1. Step one",
      }),
    ).toBe(true);
  });

  it("Q4: stores trimmed ending_position on draft PATCH", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(
        storage,
        id("pr-q4-trim-draft"),
        "trim@example.com",
      );
      const requestId = id("req-q4-trim");
      const exerciseId = await seedExercise(storage, practitioner, id("ex-q4-trim"));
      const versionId = id("ver-q4-trim");
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
      const view = await service.updateDraft({
        practitionerId: practitioner,
        requestId,
        patch: { ending_position: "  Trimmed end.  " },
      });
      expect(view.draft?.ending_position).toBe("Trimmed end.");
    } finally {
      storage.close();
    }
  });

  it("Q4: draft PATCH returns 400 for too-long ending without storing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-q4-long-draft"));
      const requestId = id("req-q4-long");
      const exerciseId = await seedExercise(storage, practitioner, id("ex-q4-long"));
      const versionId = id("ver-q4-long");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          title: "Heel slide",
        }),
      );
      await storage.run(
        `UPDATE exercise_versions SET ending_position = ? WHERE id = ?`,
        ["Kept value.", versionId],
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
      const tooLong = "z".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 1);
      await expect(
        service.updateDraft({
          practitionerId: practitioner,
          requestId,
          patch: { ending_position: tooLong },
        }),
      ).rejects.toThrow();
      const row = await storage.first<{ ending_position: string }>(
        "SELECT ending_position FROM exercise_versions WHERE id = ?",
        [versionId],
      );
      expect(row?.ending_position).toBe("Kept value.");
    } finally {
      storage.close();
    }
  });

  it("Q4: draft PATCH returns 400 for patient-details ending without storing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitioner = await seedPractitioner(storage, id("pr-q4-phi-draft"));
      const requestId = id("req-q4-phi");
      const exerciseId = await seedExercise(storage, practitioner, id("ex-q4-phi"));
      const versionId = id("ver-q4-phi");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          title: "Heel slide",
        }),
      );
      await storage.run(
        `UPDATE exercise_versions SET ending_position = ? WHERE id = ?`,
        ["Kept value.", versionId],
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
      await expect(
        service.updateDraft({
          practitionerId: practitioner,
          requestId,
          patch: { ending_position: `Notes ${FAKE_DOB_SNIPPET}` },
        }),
      ).rejects.toThrow();
      const row = await storage.first<{ ending_position: string }>(
        "SELECT ending_position FROM exercise_versions WHERE id = ?",
        [versionId],
      );
      expect(row?.ending_position).toBe("Kept value.");
    } finally {
      storage.close();
    }
  });

  it("Q4: Edit my copy returns 400 for too-long ending without storing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage, id("pr-q4-long-mycopy"));
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
      const details = await service.getExerciseDetails(practId, FIXTURE_EXERCISE_ID);
      const field = details.resolved_text.find((f) => f.key === "ending_position");
      expect(field?.resolved).not.toBe(tooLong);
    } finally {
      storage.close();
    }
  });

  it("Q4: Edit my copy returns 400 for patient-details ending without storing", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practId = await seedPractitioner(storage, id("pr-q4-phi-mycopy"));
      await seedApprovedExerciseVersion(storage, practId);
      const service = new ExerciseLibraryService(storage, MCP_TEST_CONFIG);
      await service.saveToMyExercises(practId, FIXTURE_EXERCISE_ID);
      const bad = `Hold ${FAKE_DOB_SNIPPET}`;
      await expect(
        service.updateMyCopy({
          practitionerId: practId,
          exerciseId: FIXTURE_EXERCISE_ID,
          textOverrides: { ending_position: bad },
        }),
      ).rejects.toMatchObject({ code: "invalid_input" });
      const details = await service.getExerciseDetails(practId, FIXTURE_EXERCISE_ID);
      const field = details.resolved_text.find((f) => f.key === "ending_position");
      expect(field?.resolved).not.toBe(bad);
    } finally {
      storage.close();
    }
  });

  it("resolvePatientTextFromProgramSnapshot keeps empty saved description without pinned fallback", () => {
    const resolved = resolvePatientTextFromProgramSnapshot(
      {
        title: "Heel slide",
        description: "",
        starting_position: "Frozen start.",
        ending_position: "Frozen end.",
      },
      {
        description: "Pinned description must not show.",
        starting_position: "Pinned start.",
        ending_position: "Pinned end.",
      },
    );
    expect(resolved.description).toBe("");
    expect(resolved.description).not.toBe("Pinned description must not show.");
  });

  it("resolvePatientTextFromProgramSnapshot keeps empty saved starting_position without pinned fallback", () => {
    const resolved = resolvePatientTextFromProgramSnapshot(
      {
        title: "Heel slide",
        description: "Frozen description.",
        starting_position: "",
        ending_position: "Frozen end.",
      },
      {
        description: "Pinned description.",
        starting_position: "Pinned start must not show.",
        ending_position: "Pinned end.",
      },
    );
    expect(resolved.starting_position).toBe("");
    expect(resolved.starting_position).not.toBe("Pinned start must not show.");
  });

  it("public share link keeps empty saved description and starting_position without pinned fallback", async () => {
    const storage = await openMigratedDatabase();
    const objects = new InMemoryObjectStorage();
    try {
      const practitionerId = await seedPractitioner(storage, id("pr-q1-empty-save"));
      await seedApprovedExerciseVersion(storage, practitionerId);
      await storage.run(
        `UPDATE exercise_versions SET description = ?, starting_position = ?, ending_position = ?
         WHERE id = ?`,
        [
          "Pinned description.",
          "Pinned starting position.",
          "Pinned ending position.",
          FIXTURE_VERSION_ID,
        ],
      );
      const programId = id("prog-q1-empty-save");
      await new ProgramsRepository(storage).create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Empty saved text",
      });
      await new ProgramRowsRepository(storage).replaceRow({
        id: id("row-q1-empty-save"),
        programId,
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 30 },
        textSnapshot: {
          title: "Heel slide",
          description: "",
          starting_position: "",
          ending_position: "Patient ending only.",
        },
        draftUpdatedAt: TS,
      });
      const publish = new ProgramPublishService(storage, WEB_BASE, () => TS);
      const published = await publish.publishProgram(practitionerId, programId);
      const token = decodeURIComponent(published.share_link.split("/l/")[1]!);
      const auth = new FakeAuthPort({
        practitioner: {
          practitionerId,
          email: "empty-save@example.com",
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
      expect(body.rows[0]?.description).toBe("");
      expect(body.rows[0]?.starting_position).toBe("");
      expect(body.rows[0]?.ending_position).toBe("Patient ending only.");
      expect(body.rows[0]?.description).not.toBe("Pinned description.");
      expect(body.rows[0]?.starting_position).not.toBe("Pinned starting position.");
    } finally {
      storage.close();
    }
  });

  it("rejects AI draft payload missing ending_position", () => {
    const payload = {
      title: "Heel slide",
      aliases: ["Heel slides"],
      category: "stretch",
      body_regions: ["knee"],
      description: "Description.",
      equipment: "Mat",
      starting_position: "Supine.",
      steps: "1. Bend knee",
      common_mistakes: "Rushing",
      regressions: "Smaller range",
      progressions: "Hold longer",
      precautions: "Stop if pain",
      cue_stretching: "Move slowly",
      cue_isometric: null,
      cue_concentric: null,
      cue_eccentric: null,
    };
    expect(parseAndValidateExerciseDraftAiPayload(payload)).toBeNull();
  });

  it("rejects AI draft payload with ending_position over MAX_LENGTH_EXERCISE_TEMPLATE_TEXT", () => {
    const payload = {
      title: "Heel slide",
      aliases: ["Heel slides"],
      category: "stretch",
      body_regions: ["knee"],
      description: "Description.",
      equipment: "Mat",
      starting_position: "Supine.",
      ending_position: "z".repeat(MAX_LENGTH_EXERCISE_TEMPLATE_TEXT + 1),
      steps: "1. Bend knee",
      common_mistakes: "Rushing",
      regressions: "Smaller range",
      progressions: "Hold longer",
      precautions: "Stop if pain",
      cue_stretching: "Move slowly",
      cue_isometric: null,
      cue_concentric: null,
      cue_eccentric: null,
    };
    expect(parseAndValidateExerciseDraftAiPayload(payload)).toBeNull();
  });

  it("regenerateMedia end prompt uses stored ending_position", async () => {
    const storage = await openMigratedDatabase();
    const storedEnd = "Knee deeply flexed with heel at hip.";
    const lastStep = "Extend knee to full range.";
    const generateEndImage = vi.fn(async (endPrompt: string) =>
      new FakeImageGeneration().generateEndImage(endPrompt),
    );
    const generateStartImage = vi.fn(async (startPrompt: string) =>
      new FakeImageGeneration().generateStartImage(startPrompt),
    );
    try {
      const practitionerId = await seedPractitioner(storage, id("pr-regen-end-d1283"));
      const exerciseId = await seedExercise(storage, practitionerId);
      const versionId = id("ver-regen-end-d1283");
      await storage.run(
        VERSION_INSERT_SQL,
        versionInsertBindings({
          id: versionId,
          exercise_id: exerciseId,
          status: "draft",
          title: "Heel slide",
          starting_position: "Supine.",
          ending_position: storedEnd,
          steps: `1. Slide heel\n2. ${lastStep}`,
        }),
      );
      const media = new PrefixMediaStorage(new InMemoryObjectStorage());
      let mediaSetSerial = 0;
      const service = new ExerciseMediaService(
        storage,
        {
          generateStartAndEndImages: async (input) =>
            new FakeImageGeneration().generateStartAndEndImages(input),
          generateStartImage,
          generateEndImage,
        },
        media,
        () => new Date(TS),
        () => id(`media-regen-end-${String(mediaSetSerial++)}`),
      );
      await service.generateInitialMediaForVersion({
        practitionerId,
        exerciseVersionId: versionId,
      });
      generateEndImage.mockClear();
      await service.regenerateMedia({
        practitionerId,
        exerciseVersionId: versionId,
        scope: "end",
      });
      const endPrompt = generateEndImage.mock.calls[0]![0] as string;
      expect(endPrompt).toContain(storedEnd);
      expect(endPrompt).not.toContain(lastStep);
    } finally {
      storage.close();
    }
  });

  it("migration 0016 backfills ending_position as empty string on existing rows", async () => {
    const storage = BetterSqliteStorage.openInMemory();
    try {
      await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
      await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
      await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
      await applyMigration(storage, MIGRATION_0005_ID, MIGRATION_0005_SQL);
      await applyMigration(storage, MIGRATION_0007_ID, MIGRATION_0007_SQL);
      await applyMigration(storage, MIGRATION_0008_ID, MIGRATION_0008_SQL);
      await applyMigration(storage, MIGRATION_0009_ID, MIGRATION_0009_SQL);
      await applyMigration(storage, MIGRATION_0011_ID, MIGRATION_0011_SQL);
      await applyMigration(storage, MIGRATION_0012_ID, MIGRATION_0012_SQL);
      await applyMigration(storage, MIGRATION_0013_ID, MIGRATION_0013_SQL);
      await applyMigration(storage, MIGRATION_0014_ID, MIGRATION_0014_SQL);
      await applyMigration(storage, MIGRATION_0015_ID, MIGRATION_0015_SQL);
      const practitionerId = await seedPractitioner(storage, id("pr-mig-0016"));
      const exerciseId = await seedExercise(storage, practitionerId, id("ex-mig-0016"));
      const versionId = id("ver-mig-0016");
      await storage.run(
        `INSERT INTO exercise_versions (
          id, exercise_id, version_number, status, approved_by, approved_at,
          title, description, equipment, starting_position, steps,
          common_mistakes, regressions, progressions, precautions,
          cue_stretching, cue_isometric, cue_concentric, cue_eccentric,
          media_set_id, change_summary, created_at
        ) VALUES (?, ?, 1, 'approved', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          versionId,
          exerciseId,
          practitionerId,
          TS,
          "Heel slide",
          "Description.",
          "Mat",
          "Supine.",
          "1. Step",
          "None",
          "Easier",
          "Harder",
          "Care",
          "Cue",
          null,
          null,
          null,
          null,
          "Created",
          TS,
        ],
      );
      await applyMigration(storage, MIGRATION_0016_ID, MIGRATION_0016_SQL);
      const row = await storage.first<{ ending_position: string }>(
        "SELECT ending_position FROM exercise_versions WHERE id = ?",
        [versionId],
      );
      expect(row?.ending_position).toBe("");
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
