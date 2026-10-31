import type Database from "better-sqlite3";
import type { AppDependencies } from "../../http/app.js";
import type { PhysioServerConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { BetterAuthPort } from "./better-auth-port.js";
import { createBetterAuthInstance } from "./create-better-auth.js";
import type {
  CreatePhysioAuthPortOptions,
  PhysioAuthPortBundle,
} from "./create-physio-auth-port.js";

export type {
  CreatePhysioAuthPortOptions,
  PhysioAuthPortBundle,
} from "./create-physio-auth-port.js";
export {
  createMcpBearerAuthHandler,
  createPhysioAuthPort,
} from "./create-physio-auth-port.js";

export type NodeAuthDependencies = PhysioAuthPortBundle & {
  sqliteDb: Database.Database;
};

export type CreateNodeAuthPortOptions = CreatePhysioAuthPortOptions;

export function createNodeAuthPort(
  sqliteDb: Database.Database,
  sql: SqlStoragePort,
  config: PhysioServerConfig,
  options: CreateNodeAuthPortOptions = {},
): NodeAuthDependencies {
  const authBundle = createBetterAuthInstance(sqliteDb, config.auth, sql, options);
  const port = new BetterAuthPort(
    authBundle.auth,
    sql,
    config.auth,
    options.consentClock,
  );
  return {
    auth: port,
    mcpResourceUrl: authBundle.mcpResourceUrl,
    sqliteDb,
  };
}

export function attachAuthToAppDependencies(
  deps: AppDependencies,
  authBundle: PhysioAuthPortBundle,
): AppDependencies {
  return {
    ...deps,
    auth: authBundle.auth,
  };
}
