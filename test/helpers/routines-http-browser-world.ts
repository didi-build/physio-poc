import { FakeAuthPort } from "../../src/auth/fake-auth-port.js";
import { handleRequest } from "../../src/http/app.js";
import { InMemoryObjectStorage } from "../../src/storage/adapters/memory/in-memory-object-storage.js";
import type { AppDependencies } from "../../src/http/app.js";
import { RoutinesLibraryService } from "../../src/services/routines/index.js";
import {
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
} from "../../src/storage/repositories/routines.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "../mcp-server-test-utils.js";
import { mutatingAppApiRequestInit } from "./mutating-app-api-request.js";
import {
  FIXTURE_EXERCISE_ID,
  FIXTURE_VERSION_ID,
  openMigratedDatabase,
} from "./exercise-sqlite-fixture.js";
import { id } from "./opaque-test-ids.js";
import { publishRoutine, seedTwoPractitioners } from "./from-routine-http-fixture.js";

export const ROUTINES_BROWSER_HTTP_BASE = "https://physio.browser.test";

export type SessionSlot = "none" | "owner" | "other";

export type RoutinesHttpBrowserWorld = {
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>;
  routineId: string;
  routineName: string;
  ownerId: string;
  otherId: string;
  ownerCookie: string;
  otherCookie: string;
  setActiveSession: (slot: SessionSlot) => void;
  dispatchBrowserRequest: (
    pathnameWithSearch: string,
    init?: RequestInit,
  ) => Promise<Response>;
  close: () => void;
};

function buildAuthDeps(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitioner: { practitionerId: string; email: string; displayName: string } | null,
  cookieName: string,
): { deps: AppDependencies; auth: FakeAuthPort; cookie: string } {
  const auth = new FakeAuthPort({
    practitioner,
    sessionCookieName: cookieName,
  });
  return {
    auth,
    cookie: practitioner ? auth.createSessionCookieHeader() : "",
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    },
  };
}

function isRoutinesOrSessionApiPath(pathname: string): boolean {
  return (
    pathname.startsWith("/api/me/routines") ||
    pathname.startsWith("/api/me/my-routines") ||
    pathname === "/api/me/session"
  );
}

export async function openRoutinesHttpBrowserWorld(): Promise<RoutinesHttpBrowserWorld> {
  const storage = await openMigratedDatabase();
  const { practitionerA: ownerId, practitionerB: otherId } =
    await seedTwoPractitioners(storage);
  const routineId = id("browser-http-routine");
  const routineName = "Browser HTTP knee";
  await publishRoutine(storage, ownerId, {
    routine: "browser-http-routine",
    draftVersion: "browser-http-draft",
    row: "browser-http-row",
    name: routineName,
    hold_s: 30,
  });
  const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
  await service.saveToMyRoutines(ownerId, routineId);
  await service.updateMyCopy({
    practitionerId: ownerId,
    routineId,
    rows: [
      {
        position: 0,
        exerciseId: FIXTURE_EXERCISE_ID,
        exerciseVersionId: FIXTURE_VERSION_ID,
        prescriptionType: "stretching",
        params: { hold_s: 45, per_day: { min: 2, max: 3 }, days_per_week: 7 },
      },
    ],
  });

  const owner = buildAuthDeps(
    storage,
    {
      practitionerId: ownerId,
      email: "a@example.com",
      displayName: "Owner Coach",
    },
    "physio.fake_session_owner",
  );
  const other = buildAuthDeps(
    storage,
    {
      practitionerId: otherId,
      email: "b@example.com",
      displayName: "Other Coach",
    },
    "physio.fake_session_other",
  );
  const unsigned = buildAuthDeps(storage, null, "physio.fake_session_owner");

  let activeSession: SessionSlot = "owner";
  const sessionToDeps: Record<SessionSlot, AppDependencies> = {
    none: unsigned.deps,
    owner: owner.deps,
    other: other.deps,
  };

  return {
    storage,
    routineId,
    routineName,
    ownerId,
    otherId,
    ownerCookie: owner.cookie,
    otherCookie: other.cookie,
    setActiveSession(slot: SessionSlot) {
      activeSession = slot;
    },
    async dispatchBrowserRequest(pathnameWithSearch, init = {}) {
      const path = pathnameWithSearch.startsWith("/")
        ? pathnameWithSearch
        : `/${pathnameWithSearch}`;
      if (
        !isRoutinesOrSessionApiPath(new URL(path, ROUTINES_BROWSER_HTTP_BASE).pathname)
      ) {
        return new Response(null, { status: 404 });
      }
      const url = `${ROUTINES_BROWSER_HTTP_BASE}${path}`;
      const headers = new Headers(init.headers);
      const cookie =
        activeSession === "owner"
          ? owner.cookie
          : activeSession === "other"
            ? other.cookie
            : "";
      if (cookie && !headers.has("cookie")) {
        headers.set("cookie", cookie);
      }
      const method = (init.method ?? "GET").toUpperCase();
      return handleRequest(
        new Request(url, mutatingAppApiRequestInit(url, { ...init, method, headers })),
        sessionToDeps[activeSession],
      );
    },
    close() {
      storage.close();
    },
  };
}

export async function ownerPersonalHold(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  ownerId: string,
  routineId: string,
): Promise<number | null> {
  const copy = await new PractitionerRoutinesRepository(storage).findForPractitioner(
    ownerId,
    routineId,
  );
  if (!copy) {
    return null;
  }
  const rows = await new PractitionerRoutineRowsRepository(storage).listForCopy(
    copy.id,
  );
  const json = rows[0]?.params_json ?? "";
  const match = json.match(/"hold_s":(\d+)/);
  return match ? Number(match[1]) : null;
}
