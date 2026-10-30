create table if not exists "jwks" (
  "id" text not null primary key,
  "publicKey" text not null,
  "privateKey" text not null,
  "createdAt" date not null,
  "expiresAt" date,
  "alg" text,
  "crv" text
);

create table if not exists "oauthClient" (
  "id" text not null primary key,
  "clientId" text not null unique,
  "clientSecret" text,
  "clientDiscoveryId" text,
  "disabled" integer,
  "skipConsent" integer,
  "enableEndSession" integer,
  "subjectType" text,
  "scopes" text,
  "clientCredentialsScopes" text,
  "userId" text references "user" ("id") on delete cascade,
  "createdAt" date,
  "updatedAt" date,
  "name" text,
  "uri" text,
  "icon" text,
  "contacts" text,
  "tos" text,
  "policy" text,
  "softwareId" text,
  "softwareVersion" text,
  "softwareStatement" text,
  "redirectUris" text not null,
  "postLogoutRedirectUris" text,
  "backchannelLogoutUri" text,
  "backchannelLogoutSessionRequired" integer,
  "tokenEndpointAuthMethod" text,
  "applicationType" text,
  "jwks" text,
  "jwksUri" text,
  "grantTypes" text,
  "responseTypes" text,
  "requirePKCE" integer,
  "dpopBoundAccessTokens" integer,
  "referenceId" text,
  "metadata" text
);

create table if not exists "oauthResource" (
  "id" text not null primary key,
  "identifier" text not null unique,
  "name" text not null,
  "accessTokenTtl" integer,
  "refreshTokenTtl" integer,
  "signingAlgorithm" text,
  "signingKeyId" text,
  "allowedScopes" text,
  "customClaims" text,
  "dpopBoundAccessTokensRequired" integer,
  "disabled" integer,
  "createdAt" date,
  "updatedAt" date,
  "policyVersion" integer,
  "metadata" text
);

create table if not exists "oauthClientResource" (
  "id" text not null primary key,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "resourceId" text not null references "oauthResource" ("identifier") on delete cascade,
  "metadata" text,
  "createdAt" date
);

create table if not exists "oauthRefreshToken" (
  "id" text not null primary key,
  "token" text not null unique,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "sessionId" text references "session" ("id") on delete set null,
  "userId" text not null references "user" ("id") on delete cascade,
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" text,
  "requestedUserInfoClaims" text,
  "expiresAt" date not null,
  "createdAt" date not null,
  "revoked" date,
  "rotatedAt" date,
  "rotationReplayResponse" text,
  "rotationReplayExpiresAt" date,
  "authTime" date,
  "confirmation" text,
  "scopes" text not null
);

create table if not exists "oauthAccessToken" (
  "id" text not null primary key,
  "token" text not null unique,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "sessionId" text references "session" ("id") on delete set null,
  "userId" text references "user" ("id") on delete cascade,
  "referenceId" text,
  "authorizationCodeId" text,
  "resources" text,
  "requestedUserInfoClaims" text,
  "refreshId" text references "oauthRefreshToken" ("id") on delete cascade,
  "expiresAt" date not null,
  "createdAt" date not null,
  "revoked" date,
  "confirmation" text,
  "scopes" text not null
);

create table if not exists "oauthConsent" (
  "id" text not null primary key,
  "clientId" text not null references "oauthClient" ("clientId") on delete cascade,
  "userId" text references "user" ("id") on delete cascade,
  "referenceId" text,
  "resources" text,
  "requestedUserInfoClaims" text,
  "scopes" text not null,
  "createdAt" date not null,
  "updatedAt" date not null
);

create table if not exists "oauthClientAssertion" (
  "id" text not null primary key,
  "expiresAt" date not null
);

create table if not exists physio_mcp_practitioner_consent (
  id text not null primary key,
  practitioner_id text not null references practitioners (id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  scopes_json text not null,
  created_at text not null
);

create table if not exists physio_mcp_pending_consent (
  id text not null primary key,
  practitioner_id text not null references practitioners (id) on delete cascade,
  client_id text not null,
  redirect_uri text not null,
  scopes_json text not null,
  oauth_query text not null,
  csrf_token_hash text not null,
  created_at_ms integer not null,
  expires_at_ms integer not null,
  consumed_at_ms integer
);

create index if not exists "oauthClient_userId_idx" on "oauthClient" ("userId");

create unique index if not exists "oauthClientResource_clientId_resourceId_uidx" on "oauthClientResource" ("clientId", "resourceId");

create index if not exists "oauthClientResource_clientId_idx" on "oauthClientResource" ("clientId");

create index if not exists "oauthClientResource_resourceId_idx" on "oauthClientResource" ("resourceId");

create index if not exists "oauthRefreshToken_clientId_idx" on "oauthRefreshToken" ("clientId");

create index if not exists "oauthRefreshToken_sessionId_idx" on "oauthRefreshToken" ("sessionId");

create index if not exists "oauthRefreshToken_userId_idx" on "oauthRefreshToken" ("userId");

create index if not exists "oauthRefreshToken_authorizationCodeId_idx" on "oauthRefreshToken" ("authorizationCodeId");

create index if not exists "oauthAccessToken_clientId_idx" on "oauthAccessToken" ("clientId");

create index if not exists "oauthAccessToken_sessionId_idx" on "oauthAccessToken" ("sessionId");

create index if not exists "oauthAccessToken_userId_idx" on "oauthAccessToken" ("userId");

create index if not exists "oauthAccessToken_refreshId_idx" on "oauthAccessToken" ("refreshId");

create index if not exists "oauthAccessToken_authorizationCodeId_idx" on "oauthAccessToken" ("authorizationCodeId");

create index if not exists "oauthConsent_clientId_idx" on "oauthConsent" ("clientId");

create index if not exists "oauthConsent_userId_idx" on "oauthConsent" ("userId");

create index if not exists physio_mcp_practitioner_consent_practitioner_client_idx on physio_mcp_practitioner_consent (
  practitioner_id,
  client_id
);

create index if not exists physio_mcp_pending_consent_practitioner_idx on physio_mcp_pending_consent (practitioner_id);
