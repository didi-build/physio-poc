import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { APIError } from "better-call";
import type { JSONWebKeySet, JWTPayload } from "jose";
import type Database from "better-sqlite3";
import type { AuthPort } from "../../auth/auth-port.js";
import type { AppDependencies } from "../../http/app.js";
import type { PhysioServerConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  createBetterAuthInstance,
  type CreateBetterAuthInstanceOptions,
} from "./create-better-auth.js";
import type { PhysioMcpConsentClock } from "../../auth/mcp-oauth/consent-routes.js";
import { BetterAuthPort } from "./better-auth-port.js";

export type NodeAuthDependencies = {
  auth: AuthPort;
  sqliteDb: Database.Database;
  mcpResourceUrl?: string;
};

export type CreateNodeAuthPortOptions = CreateBetterAuthInstanceOptions & {
  consentClock?: PhysioMcpConsentClock;
};

export function createNodeAuthPort(
  sqliteDb: Database.Database,
  sql: SqlStoragePort,
  config: PhysioServerConfig,
  options: CreateNodeAuthPortOptions = {},
): NodeAuthDependencies {
  const bundle = createBetterAuthInstance(sqliteDb, config.auth, sql, options);
  const port = new BetterAuthPort(bundle.auth, sql, config.auth, options.consentClock);
  return {
    sqliteDb,
    auth: port,
    mcpResourceUrl: bundle.mcpResourceUrl,
  };
}

export function createMcpBearerAuthHandler(
  authBundle: NodeAuthDependencies,
  config: PhysioServerConfig,
): AppDependencies["mcpBearerAuth"] {
  if (!authBundle.mcpResourceUrl) {
    return undefined;
  }
  const port = authBundle.auth;
  if (!(port instanceof BetterAuthPort)) {
    return undefined;
  }
  const auth = port.getBetterAuthRuntime();
  const authBase = config.auth.authBaseUrl.replace(/\/$/, "");
  const issuer = `${authBase}/api/auth`;
  const jwksEndpoint = `${issuer}/jwks`;
  const resource = authBundle.mcpResourceUrl;
  const jwksFetch = async (): Promise<JSONWebKeySet> => {
    const response = await auth.handler(new Request(jwksEndpoint));
    if (!response.ok) {
      throw new TypeError("JWKS fetch failed");
    }
    return (await response.json()) as JSONWebKeySet;
  };
  const verificationOptions = {
    issuer,
    audience: resource,
    jwtVerifyOptions: { requiredClaims: ["azp"] },
    // In-process JWKS: Vitest and Node dev call handleRequest without a listening HTTP server.
    jwksUrl: jwksFetch as unknown as string,
  };
  const sqliteDb = authBundle.sqliteDb;

  function mcpAuthChallengeResponse(message: string): Response {
    const challenge = createResourceServerChallenge(
      new APIError("UNAUTHORIZED", { message }),
      resource,
      {},
    );
    if (!challenge) {
      return new Response(null, { status: 401 });
    }
    const headers = new Headers(challenge.headers);
    headers.set("Content-Type", "application/json");
    return new Response(
      JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32000, message: challenge.message },
        id: null,
      }),
      { status: challenge.statusCode, headers },
    );
  }

  function isAccessTokenSessionActive(claims: JWTPayload): boolean {
    const sessionId = claims.sid;
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return false;
    }
    const row = sqliteDb
      .prepare('SELECT expiresAt FROM "session" WHERE id = ? LIMIT 1')
      .get(sessionId) as { expiresAt: number | Date | string } | undefined;
    if (!row) {
      return false;
    }
    const raw = row.expiresAt;
    const expiresAtMs =
      raw instanceof Date
        ? raw.getTime()
        : typeof raw === "number"
          ? raw
          : Date.parse(String(raw));
    return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
  }

  return (request, mcpHandler) =>
    createMcpProtectedRequestHandler(verificationOptions, (innerRequest, claims) => {
      if (!isAccessTokenSessionActive(claims)) {
        return Promise.resolve(mcpAuthChallengeResponse("token inactive"));
      }
      return mcpHandler(innerRequest);
    })(request);
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
