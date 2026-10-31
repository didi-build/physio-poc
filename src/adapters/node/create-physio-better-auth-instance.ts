import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import type { ClientMetadataResourceFetch } from "@better-auth/oauth-provider";
import type { D1Database } from "@better-auth/core";
import type Database from "better-sqlite3";
import type { PhysioAuthConfig } from "../../http/config.js";
import { resolveBetterAuthSecretForRuntime } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import { createPhysioMcpOAuthPlugins } from "./physio-mcp-oauth-plugins.js";
import type { BetterAuthHandle, BetterAuthRuntime } from "./better-auth-types.js";
import { buildPhysioBetterAuthOptions } from "./create-better-auth-core.js";

export type PhysioBetterAuthDatabase = Database.Database | D1Database;

export type CreatePhysioBetterAuthInstanceOptions = {
  cimdMetadataFetch?: ClientMetadataResourceFetch;
};

export type BuildPhysioBetterAuthOptionsInput = Omit<
  Parameters<typeof betterAuth>[0],
  "database"
>;

export function createPhysioBetterAuthInstance(
  database: PhysioBetterAuthDatabase,
  config: PhysioAuthConfig,
  sql: SqlStoragePort,
  options: CreatePhysioBetterAuthInstanceOptions = {},
  baseOptionsOverride?: BuildPhysioBetterAuthOptionsInput,
): BetterAuthHandle {
  const baseOptions = baseOptionsOverride ?? buildPhysioBetterAuthOptions(sql, config);
  void resolveBetterAuthSecretForRuntime(config.betterAuthSecret);

  let mcpResourceUrl: string | undefined;
  const oauthPlugins = [];
  if (options.cimdMetadataFetch) {
    const plugins = createPhysioMcpOAuthPlugins(config, options.cimdMetadataFetch);
    mcpResourceUrl = plugins.mcpResourceUrl;
    oauthPlugins.push(jwt(), plugins.mcpPlugin, plugins.cimdPlugin);
  }

  const auth = betterAuth({
    ...baseOptions,
    database,
    plugins: [...(baseOptions.plugins ?? []), ...oauthPlugins],
  });

  return {
    auth: auth as BetterAuthRuntime,
    sessionCookieName: "better-auth.session_token",
    mcpResourceUrl,
  };
}
