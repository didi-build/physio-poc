import type { AuthPort } from "../../auth/auth-port.js";
import type { AppDependencies } from "../../http/app.js";
import type { PhysioServerConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { createBetterAuthInstance } from "./create-better-auth.js";
import { BetterAuthPort } from "./better-auth-port.js";
import type Database from "better-sqlite3";

export type NodeAuthDependencies = {
  auth: AuthPort;
  sqliteDb: Database.Database;
};

export function createNodeAuthPort(
  sqliteDb: Database.Database,
  sql: SqlStoragePort,
  config: PhysioServerConfig,
): NodeAuthDependencies {
  const { auth } = createBetterAuthInstance(sqliteDb, config.auth, sql);
  return {
    sqliteDb,
    auth: new BetterAuthPort(auth, sql, config.auth),
  };
}

export function attachAuthToAppDependencies(
  deps: AppDependencies,
  authBundle: NodeAuthDependencies,
): AppDependencies {
  return {
    ...deps,
    auth: authBundle.auth,
  };
}
