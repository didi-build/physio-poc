import { FakeAuthPort } from "../../src/auth/fake-auth-port.js";
import { handleRequest } from "../../src/http/app.js";
import { InMemoryObjectStorage } from "../../src/storage/adapters/memory/in-memory-object-storage.js";
import {
  MCP_TEST_CONFIG,
  createTestPhysioMcpHttpHandler,
} from "../mcp-server-test-utils.js";
import { mutatingAppApiRequestInit } from "./mutating-app-api-request.js";
import { publishRoutine, seedTwoPractitioners } from "./from-routine-http-fixture.js";
import { id } from "./opaque-test-ids.js";
import type { AppDependencies } from "../../src/http/app.js";
import { RoutineVersionsRepository } from "../../src/storage/repositories/routines.js";
import { RoutinesLibraryService } from "../../src/services/routines/index.js";
import { ME_BODY_REGIONS_PATH } from "../../src/me-session-api-paths.js";
import {
  ROUTINES_MY_ROUTINES_PATH,
  routineDetailsPath,
} from "../../src/routine-library-api-paths.js";
import { RoutinesClient, type FetchFn } from "../../src/ui/api/routines-client.js";
import { openMigratedDatabase, TS } from "./exercise-sqlite-fixture.js";
import { parseExerciseParamsJson } from "../../src/domain/exercise-params.js";
import { SqlBatchGuardError } from "../../src/storage/errors/sql-batch-error.js";
import type { SqlStoragePort } from "../../src/storage/ports/sql-storage.js";
import {
  PractitionerRoutineRowsRepository,
  PractitionerRoutinesRepository,
  RoutineRepositoryError,
} from "../../src/storage/repositories/routines.js";

export const ROUTINES_HTTP_UI_BASE = "https://physio.test.example";

export type RoutinesHttpUiFixture = {
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>;
  practitionerId: string;
  routineId: string;
  deps: AppDependencies;
  cookie: string;
  client: RoutinesClient;
};

export function appDepsForRoutinesHttpUi(
  storage: Awaited<ReturnType<typeof openMigratedDatabase>>,
  practitionerId: string,
  email: string,
): { deps: AppDependencies; cookie: string } {
  const auth = new FakeAuthPort({
    practitioner: {
      practitionerId,
      email,
      displayName: "Tester",
    },
  });
  return {
    deps: {
      sql: storage,
      objects: new InMemoryObjectStorage(),
      config: MCP_TEST_CONFIG,
      auth,
      mcp: createTestPhysioMcpHttpHandler(storage, MCP_TEST_CONFIG),
    },
    cookie: auth.createSessionCookieHeader(),
  };
}

function pathnameFromFetchInput(input: RequestInfo | URL): string {
  const raw =
    typeof input === "string"
      ? input
      : input instanceof URL
        ? `${input.pathname}${input.search}`
        : input.url;
  return raw.startsWith("http") ? new URL(raw).pathname + new URL(raw).search : raw;
}

/** Stubs planned body-region list + `body_region_id` on details until the privileged API lands. */
export function createRoutinesHttpFetch(
  deps: AppDependencies,
  cookie: string,
  options: { authMutations?: boolean; stubPlannedBodyRegionApi?: boolean } = {},
): FetchFn {
  const authMutations = options.authMutations ?? true;
  const stubPlannedBodyRegionApi = options.stubPlannedBodyRegionApi ?? false;
  return async (input, init) => {
    const path = pathnameFromFetchInput(input);
    const pathOnly = path.split("?")[0] ?? path;
    const method = (init?.method ?? "GET").toUpperCase();

    if (
      stubPlannedBodyRegionApi &&
      method === "GET" &&
      pathOnly === ME_BODY_REGIONS_PATH
    ) {
      const rows = await deps.sql.all<{ id: string; label: string }>(
        "SELECT id, label FROM body_regions ORDER BY label ASC",
        [],
      );
      return Response.json(rows);
    }

    const url = `${ROUTINES_HTTP_UI_BASE}${path.startsWith("/") ? path : `/${path}`}`;
    const headers = new Headers(init?.headers);
    const isMutation = method === "POST" || method === "PATCH" || method === "DELETE";
    const attachCookie = authMutations || !isMutation;
    if (attachCookie && !headers.has("cookie")) {
      headers.set("cookie", cookie);
    }
    const response = await handleRequest(
      new Request(url, mutatingAppApiRequestInit(url, { ...init, method, headers })),
      deps,
    );

    if (
      stubPlannedBodyRegionApi &&
      method === "GET" &&
      pathOnly.startsWith("/api/me/routines/") &&
      !pathOnly.endsWith("/versions") &&
      pathOnly !== ROUTINES_MY_ROUTINES_PATH &&
      !pathOnly.includes("/community/")
    ) {
      const suffix = pathOnly.slice("/api/me/routines/".length);
      if (suffix.length > 0 && !suffix.includes("/")) {
        const routineId = decodeURIComponent(suffix);
        const expectedDetailsPath = routineDetailsPath(routineId);
        if (pathOnly === expectedDetailsPath) {
          const rows = await deps.sql.all<{
            body_region_id: string;
            condition_id: string | null;
          }>("SELECT body_region_id, condition_id FROM routines WHERE id = ? LIMIT 1", [
            routineId,
          ]);
          const row = rows[0];
          if (row?.body_region_id) {
            const json = (await response.clone().json()) as Record<string, unknown>;
            return Response.json(
              {
                ...json,
                body_region_id: row.body_region_id,
                condition_id: row.condition_id,
              },
              {
                status: response.status,
                headers: response.headers,
              },
            );
          }
        }
      }
    }

    return response;
  };
}

/** Forces replaceMyCopyRows through a real batch guard failure (stale_write). */
export function installRealStaleAdoptCopyFixture(
  wrongPractitionerId: string,
): () => void {
  const original =
    PractitionerRoutinesRepository.prototype.replaceSavedCopyFromPublished;
  PractitionerRoutinesRepository.prototype.replaceSavedCopyFromPublished =
    async function (input) {
      const copy = await this.findForPractitioner(
        input.practitionerId,
        input.routineId,
      );
      if (!copy) {
        throw new RoutineRepositoryError("Saved routine copy not found");
      }
      if (input.rows.length === 0) {
        throw new RoutineRepositoryError("Cannot replace with an empty routine copy");
      }
      const rowRepo = new PractitionerRoutineRowsRepository(
        (this as unknown as { sql: SqlStoragePort }).sql,
      );
      const rowStatements = input.rows.map((row) =>
        rowRepo.buildInsertRowBatchStatement({
          id: row.id,
          practitionerRoutineId: copy.id,
          position: row.position,
          exerciseId: row.exerciseId,
          exerciseVersionId: row.exerciseVersionId,
          prescriptionType: row.prescriptionType,
          params: row.params,
        }),
      );
      try {
        const sql = (this as unknown as { sql: SqlStoragePort }).sql;
        await sql.batch(
          this.buildReplaceSavedCopyBatchStatements({
            practitionerRoutineId: copy.id,
            practitionerId: wrongPractitionerId,
            routineId: input.routineId,
            sourceRoutineVersionId: input.sourceRoutineVersionId,
            sourceVersionNumber: input.sourceVersionNumber,
            rowStatements,
          }),
        );
      } catch (error) {
        if (error instanceof SqlBatchGuardError) {
          throw new RoutineRepositoryError("Stale write", {
            code: "stale_write",
            cause: error,
          });
        }
        throw error;
      }
      const updated = await this.findForPractitioner(
        input.practitionerId,
        input.routineId,
      );
      if (!updated) {
        throw new RoutineRepositoryError("Replace saved copy failed");
      }
      return updated;
    };
  return () => {
    PractitionerRoutinesRepository.prototype.replaceSavedCopyFromPublished = original;
  };
}

export function installRealStaleRestoreSavedCopyFixture(
  wrongPractitionerId: string,
): () => void {
  const original =
    PractitionerRoutinesRepository.prototype.restoreSavedCopyFromSnapshot;
  PractitionerRoutinesRepository.prototype.restoreSavedCopyFromSnapshot =
    async function (input) {
      const existing = await this.findForPractitioner(
        input.practitionerId,
        input.routineId,
      );
      const copyId = existing?.id ?? input.snapshot.id;
      const rowRepo = new PractitionerRoutineRowsRepository(
        (this as unknown as { sql: SqlStoragePort }).sql,
      );
      const rowStatements = input.snapshot.rows.map((row) =>
        rowRepo.buildInsertRowBatchStatement({
          id: crypto.randomUUID(),
          practitionerRoutineId: copyId,
          position: row.position,
          exerciseId: row.exercise_id,
          exerciseVersionId: row.exercise_version_id,
          prescriptionType: row.prescription_type,
          params: parseExerciseParamsJson(row.params_json),
        }),
      );
      try {
        const sql = (this as unknown as { sql: SqlStoragePort }).sql;
        await sql.batch(
          this.buildRestoreSavedCopyBatchStatements({
            practitionerId: wrongPractitionerId,
            routineId: input.routineId,
            practitionerRoutineId: copyId,
            snapshot: {
              source_routine_version_id: input.snapshot.source_routine_version_id,
              source_version_number: input.snapshot.source_version_number,
              saved_at: input.snapshot.saved_at,
              last_used_at: input.snapshot.last_used_at,
              edited: input.snapshot.edited,
            },
            rowStatements,
            hadExistingCopy: existing !== null,
          }),
        );
      } catch (error) {
        if (error instanceof SqlBatchGuardError) {
          throw new RoutineRepositoryError("Stale write", {
            code: "stale_write",
            cause: error,
          });
        }
        throw error;
      }
      const restored = await this.findForPractitioner(
        input.practitionerId,
        input.routineId,
      );
      if (!restored) {
        throw new RoutineRepositoryError("Restore saved copy failed");
      }
      return restored;
    };
  return () => {
    PractitionerRoutinesRepository.prototype.restoreSavedCopyFromSnapshot = original;
  };
}

export function installRealStaleReplaceMyCopyRowsFixture(
  wrongPractitionerId: string,
): () => void {
  const original = PractitionerRoutinesRepository.prototype.replaceMyCopyRows;
  PractitionerRoutinesRepository.prototype.replaceMyCopyRows = async function (input) {
    const copy = await this.findForPractitioner(input.practitionerId, input.routineId);
    if (!copy) {
      throw new RoutineRepositoryError("Saved routine copy not found");
    }
    const rowRepo = new PractitionerRoutineRowsRepository(
      (this as unknown as { sql: SqlStoragePort }).sql,
    );
    const rowStatements = input.rows.map((row) =>
      rowRepo.buildInsertRowBatchStatement({
        id: row.id,
        practitionerRoutineId: copy.id,
        position: row.position,
        exerciseId: row.exerciseId,
        exerciseVersionId: row.exerciseVersionId,
        prescriptionType: row.prescriptionType,
        params: row.params,
      }),
    );
    try {
      const sql = (this as unknown as { sql: SqlStoragePort }).sql;
      await sql.batch(
        this.buildReplaceMyCopyRowsBatchStatements({
          practitionerRoutineId: copy.id,
          practitionerId: wrongPractitionerId,
          rowStatements,
        }),
      );
    } catch (error) {
      if (error instanceof SqlBatchGuardError) {
        throw new RoutineRepositoryError("Stale write", {
          code: "stale_write",
          cause: error,
        });
      }
      throw error;
    }
    const updated = await this.findForPractitioner(
      input.practitionerId,
      input.routineId,
    );
    if (!updated) {
      throw new RoutineRepositoryError("Saved routine copy not found after update");
    }
    return updated;
  };
  return () => {
    PractitionerRoutinesRepository.prototype.replaceMyCopyRows = original;
  };
}

/** Published community routine with no saved personal copy yet. */
export async function openPublishedRoutineNoCopyHttpUiFixture(
  seedKey: string,
): Promise<RoutinesHttpUiFixture> {
  const storage = await openMigratedDatabase();
  const { practitionerA: author } = await seedTwoPractitioners(storage);
  const routineId = id(`ui-http-${seedKey}-routine`);
  await publishRoutine(storage, author, {
    routine: `ui-http-${seedKey}-routine`,
    draftVersion: `ui-http-${seedKey}-draft`,
    row: `ui-http-${seedKey}-row`,
    name: `UI HTTP ${seedKey}`,
  });
  const { deps, cookie } = appDepsForRoutinesHttpUi(storage, author, "a@example.com");
  const client = new RoutinesClient({
    fetchFn: createRoutinesHttpFetch(deps, cookie),
  });
  return { storage, practitionerId: author, routineId, deps, cookie, client };
}

export async function openFlaggedRoutineHttpUiFixture(
  seedKey: string,
): Promise<RoutinesHttpUiFixture> {
  const storage = await openMigratedDatabase();
  const { practitionerA: author } = await seedTwoPractitioners(storage);
  const routineId = id(`ui-http-${seedKey}-routine`);
  const v1 = await publishRoutine(storage, author, {
    routine: `ui-http-${seedKey}-routine`,
    draftVersion: `ui-http-${seedKey}-draft`,
    row: `ui-http-${seedKey}-row`,
    name: `UI HTTP ${seedKey}`,
  });
  const service = new RoutinesLibraryService(storage, MCP_TEST_CONFIG);
  await service.saveToMyRoutines(author, routineId);
  await new RoutineVersionsRepository(storage).savePublishedVersion({
    id: id(`ui-http-${seedKey}-v2`),
    routineId,
    createdBy: author,
    createdAt: TS,
    name: `UI HTTP ${seedKey} v2`,
    copyFromVersionId: v1.id,
  });
  const { deps, cookie } = appDepsForRoutinesHttpUi(storage, author, "a@example.com");
  const client = new RoutinesClient({
    fetchFn: createRoutinesHttpFetch(deps, cookie),
  });
  return { storage, practitionerId: author, routineId, deps, cookie, client };
}
