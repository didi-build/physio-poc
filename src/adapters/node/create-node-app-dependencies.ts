import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import type { AppDependencies } from "../../http/app.js";
import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
  MIGRATION_0003_ID,
  MIGRATION_0004_ID,
  MIGRATION_0006_ID,
  MIGRATION_0007_ID,
} from "../../storage/migrations/apply.js";
import { BetterSqliteStorage } from "./better-sqlite-sql-storage.js";
import type { PhysioMcpConsentClock } from "../../auth/mcp-oauth/consent-routes.js";
import { createMcpBearerAuthHandler, createNodeAuthPort } from "./create-auth-port.js";
import { createDistUiStaticPort } from "./dist-ui-static-port.js";
import { resolveNodePhysioServerConfig } from "./resolve-node-config.js";
import { createPhysioMcpHttpHandler } from "../workers/mcp/handle-mcp-http-request.js";
import type { WorkerEnv } from "../workers/create-app-dependencies.js";

const REPO_ROOT = join(import.meta.dirname, "..", "..", "..");
const MIGRATION_0001_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0001_exercise_data_model.sql"),
  "utf8",
);
const MIGRATION_0002_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0002_program_data_model.sql"),
  "utf8",
);
const MIGRATION_0003_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0003_exercise_media.sql"),
  "utf8",
);
const MIGRATION_0004_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0004_better_auth.sql"),
  "utf8",
);
const MIGRATION_0006_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0006_mcp_oauth.sql"),
  "utf8",
);
const MIGRATION_0007_SQL = readFileSync(
  join(REPO_ROOT, "migrations/0007_sql_batch_min_rows_guard.sql"),
  "utf8",
);

const defaultCimdMetadataFetch: ClientMetadataResourceFetch = async () =>
  new Response(null, { status: 404 });

export type NodeEnvInput = WorkerEnv & {
  BETTER_AUTH_SECRET?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  PHYSIO_ALLOWED_GOOGLE_EMAILS?: string;
  PHYSIO_USE_FAKE_GOOGLE_PROVIDER?: string;
  AUTH_BASE_URL?: string;
  NODE_ENV?: string;
};

export async function createNodeAppDependencies(
  env: NodeEnvInput,
  options: {
    cimdMetadataFetch?: ClientMetadataResourceFetch;
    consentClock?: PhysioMcpConsentClock;
  } = {},
): Promise<AppDependencies> {
  const config = resolveNodePhysioServerConfig(env, "127.0.0.1:8787");
  const storage = BetterSqliteStorage.openInMemory();
  await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  await applyMigration(storage, MIGRATION_0003_ID, MIGRATION_0003_SQL);
  await applyMigration(storage, MIGRATION_0004_ID, MIGRATION_0004_SQL);
  await applyMigration(storage, MIGRATION_0006_ID, MIGRATION_0006_SQL);
  await applyMigration(storage, MIGRATION_0007_ID, MIGRATION_0007_SQL);
  const authBundle = createNodeAuthPort(storage.nativeDatabase(), storage, config, {
    cimdMetadataFetch: options.cimdMetadataFetch ?? defaultCimdMetadataFetch,
    consentClock: options.consentClock,
  });
  const mcpHandler = createPhysioMcpHttpHandler(config);
  return {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config,
    auth: authBundle.auth,
    mcp: mcpHandler,
    mcpBearerAuth: createMcpBearerAuthHandler(authBundle, config),
    uiStatic: createDistUiStaticPort(),
    enableFakeGoogleRoutes: config.auth.fakeGoogleProviderEnabled,
    guardedAppWithoutSession: "redirect",
  };
}
