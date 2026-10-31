import type Database from "better-sqlite3";
import type { PhysioAuthConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { createPhysioBetterAuthInstance } from "./create-physio-better-auth-instance.js";
import type { BetterAuthHandle } from "./better-auth-types.js";
import {
  buildFakeGooglePhysioBetterAuthOptions,
  installFakeGoogleForBetterAuth,
} from "./fake-google-better-auth.js";
import { buildPhysioBetterAuthOptions } from "./create-better-auth-core.js";

export type CreateBetterAuthInstanceOptions =
  import("./create-physio-better-auth-instance.js").CreatePhysioBetterAuthInstanceOptions;

export {
  buildPhysioBetterAuthOptions,
  createPhysioBetterAuthDatabaseHooks,
  createDefaultPhysioValidateUserInfo,
  PHYSIO_BETTER_AUTH_ACCOUNT,
  PHYSIO_BETTER_AUTH_SESSION_EXPIRES_IN_SECONDS,
  PhysioPractitionerBindingError,
} from "./create-better-auth-core.js";

export function buildPhysioBetterAuthOptionsForConfig(
  sql: SqlStoragePort,
  config: PhysioAuthConfig,
): import("./create-physio-better-auth-instance.js").BuildPhysioBetterAuthOptionsInput {
  if (config.fakeGoogleProviderEnabled) {
    return buildFakeGooglePhysioBetterAuthOptions(sql, config);
  }
  return buildPhysioBetterAuthOptions(sql, config);
}

export function createBetterAuthInstance(
  database: Database.Database,
  config: PhysioAuthConfig,
  sql: SqlStoragePort,
  options: CreateBetterAuthInstanceOptions = {},
): BetterAuthHandle {
  if (config.fakeGoogleProviderEnabled) {
    installFakeGoogleForBetterAuth(config.authBaseUrl);
    const fakeOptions = buildFakeGooglePhysioBetterAuthOptions(sql, config);
    return createPhysioBetterAuthInstance(database, config, sql, options, fakeOptions);
  }
  return createPhysioBetterAuthInstance(database, config, sql, options);
}
