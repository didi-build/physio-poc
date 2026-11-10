import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest } from "../src/http/app.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  ProgramRowsRepository,
  ProgramsRepository,
} from "../src/storage/repositories/programs.js";
import { SHARE_LINK_EXPIRES_IN } from "../src/mcp-connector/share-link-expiry.js";
import { programPublishPath, programShareLinkPath } from "../src/programs-api-paths.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
  seedApprovedExerciseVersion,
  seedPractitioner,
  TS,
} from "./helpers/exercise-sqlite-fixture.js";
import { mutatingAppApiRequestInit } from "./helpers/mutating-app-api-request.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "./mcp-server-test-utils.js";
import { id } from "./helpers/opaque-test-ids.js";

const BASE = "https://physio.test.example";

function apiDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practId: string,
) {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId: practId,
      email: "coach@example.com",
      displayName: "Coach",
    },
    sessionCookieName: `physio.fake_session.${practId}`,
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
      auth,
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

async function seedExerciseRow(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  programId: string,
  practitionerId: string,
) {
  await seedApprovedExerciseVersion(storage, practitionerId);
  await new ProgramRowsRepository(storage).replaceRow({
    id: id("row-1014"),
    programId,
    position: 0,
    exerciseId: FIXTURE_EXERCISE_ID,
    exerciseVersionId: FIXTURE_VERSION_ID,
    prescriptionType: "stretching",
    params: { hold_s: 30 },
    textSnapshot: { title: "Heel slide" },
    draftUpdatedAt: TS,
  });
}

describe("Program publish UI backing API (DIDI-1014)", () => {
  it("returns publish preview fields on share-link GET after first publish", async () => {
    const storage = await openMigratedDatabase();
    try {
      const practitionerId = await seedPractitioner(storage);
      const programs = new ProgramsRepository(storage);
      const programId = id("prog-1014");
      await programs.create({
        id: programId,
        createdBy: practitionerId,
        createdAt: TS,
        name: "Knee rehab",
      });
      await seedExerciseRow(storage, programId, practitionerId);
      const { deps, cookie } = apiDeps(storage, practitionerId);
      const publishUrl = `${BASE}${programPublishPath(programId)}`;
      const publish = await handleRequest(
        new Request(
          publishUrl,
          mutatingAppApiRequestInit(publishUrl, {
            method: "POST",
            headers: { cookie, "content-type": "application/json" },
            body: JSON.stringify({ expires_in: SHARE_LINK_EXPIRES_IN.one_year }),
          }),
        ),
        deps,
      );
      expect(publish.status).toBe(200);
      const shareUrl = `${BASE}${programShareLinkPath(programId)}`;
      const get = await handleRequest(
        new Request(shareUrl, { headers: { cookie } }),
        deps,
      );
      expect(get.status).toBe(200);
      const body = (await get.json()) as {
        publish_change_lines: string[];
        practitioner_default_expires_in: string;
        share_link: string;
      };
      expect(body.practitioner_default_expires_in).toBe("1_year");
      expect(body.publish_change_lines).toEqual([]);
      expect(body.share_link).toMatch(/\/l\//);
    } finally {
      storage.close();
    }
  });
});
