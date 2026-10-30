import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { AppDependencies } from "../../http/app.js";
import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";
import {
  applyMigration,
  MIGRATION_0001_ID,
  MIGRATION_0002_ID,
} from "../../storage/migrations/apply.js";
import { BetterSqliteStorage } from "./better-sqlite-sql-storage.js";
import { createNodeAuthPort } from "./create-auth-port.js";
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
  join(REPO_ROOT, "migrations/0002_better_auth.sql"),
  "utf8",
);

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
): Promise<AppDependencies> {
  const config = resolveNodePhysioServerConfig(env, "127.0.0.1:8787");
  const storage = BetterSqliteStorage.openInMemory();
  await applyMigration(storage, MIGRATION_0001_ID, MIGRATION_0001_SQL);
  await applyMigration(storage, MIGRATION_0002_ID, MIGRATION_0002_SQL);
  const authBundle = createNodeAuthPort(storage.nativeDatabase(), storage, config);
  return {
    sql: storage,
    objects: new InMemoryObjectStorage(),
    config,
    auth: authBundle.auth,
    mcp: createPhysioMcpHttpHandler(config),
    uiStatic: createDistUiStaticPort(),
  };
}
