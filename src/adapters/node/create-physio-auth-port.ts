import { createMcpProtectedRequestHandler } from "@better-auth/mcp";
import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { APIError } from "better-call";
import type { JSONWebKeySet, JWTPayload } from "jose";
import type { AuthPort } from "../../auth/auth-port.js";
import type { AppDependencies } from "../../http/app.js";
import type { PhysioServerConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  createPhysioBetterAuthInstance,
  type CreatePhysioBetterAuthInstanceOptions,
  type PhysioBetterAuthDatabase,
} from "./create-physio-better-auth-instance.js";
import type { PhysioMcpConsentClock } from "../../auth/mcp-oauth/consent-routes.js";
import { BetterAuthPort } from "./better-auth-port.js";

export type PhysioAuthPortBundle = {
  auth: AuthPort;
  mcpResourceUrl?: string;
};

export type CreatePhysioAuthPortOptions = CreatePhysioBetterAuthInstanceOptions & {
  consentClock?: PhysioMcpConsentClock;
};

export function createPhysioAuthPort(
  database: PhysioBetterAuthDatabase,
  sql: SqlStoragePort,
  config: PhysioServerConfig,
  options: CreatePhysioAuthPortOptions = {},
): PhysioAuthPortBundle {
  const authBundle = createPhysioBetterAuthInstance(
    database,
    config.auth,
    sql,
    options,
  );
  const port = new BetterAuthPort(
    authBundle.auth,
    sql,
    config.auth,
    options.consentClock,
  );
  return {
    auth: port,
    mcpResourceUrl: authBundle.mcpResourceUrl,
  };
}

export function createMcpBearerAuthHandler(
  authBundle: PhysioAuthPortBundle,
  config: PhysioServerConfig,
  sql: SqlStoragePort,
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
    jwksUrl: jwksFetch as unknown as string,
  };

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

  async function isAccessTokenSessionActive(claims: JWTPayload): Promise<boolean> {
    const sessionId = claims.sid;
    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return false;
    }
    const row = await sql.first<{ expiresAt: string | number }>(
      'SELECT expiresAt FROM "session" WHERE id = ? LIMIT 1',
      [sessionId],
    );
    if (!row) {
      return false;
    }
    const raw = row.expiresAt;
    const expiresAtMs = typeof raw === "number" ? raw : Date.parse(String(raw));
    return Number.isFinite(expiresAtMs) && expiresAtMs > Date.now();
  }

  return (request, mcpHandler) =>
    createMcpProtectedRequestHandler(verificationOptions, (innerRequest, claims) => {
      return isAccessTokenSessionActive(claims).then((active) => {
        if (!active) {
          return mcpAuthChallengeResponse("token inactive");
        }
        return mcpHandler(innerRequest);
      });
    })(request);
}
