# 0004. Portable runtime, storage ports, and shared services

- **Status:** accepted
- **Date:** 2026-10-29
- **Decided by:** CTO (Oct 29, 2026). Answers recorded on [physio-poc#7](https://github.com/didi-build/physio-poc/pull/7) and Linear DIDI-996. QA round 1 rulings (Oct 29, 2026, 3:51 PM ET) are folded in below.

## Context

Physio POC must ship on Cloudflare Workers first (DIDI-990) with a path to Kubernetes later, expose one remote MCP server over Streamable HTTP on a public HTTPS URL (DIDI-594), and keep domain logic free of platform bindings. The CTO data model stores exercise and program row params as JSON TEXT in D1-compatible SQL. The hard rule is that nothing stores patient information; programs are identified by our own id or code and an optional non-identifying title. Design specs live under `design/` (squash `1a82b7d`); MCP tool JSON Schema lives in `src/mcp-connector/` (DIDI-989, physio-poc#6).

**Domain types:** Schema and domain types are out of scope for DIDI-996. They start in DIDI-997 and DIDI-1000, aligned to the physio-poc#6 contract. This ticket keeps only generic, schema-free ports and services.

**SQL in tests:** No SQLite library in DIDI-996. In-memory SQL adapters are plain TypeScript fakes. When DIDI-997 needs real SQLite for tests, add an exact-pinned `better-sqlite3` devDependency (not experimental `node:sqlite`). Do not add `better-sqlite3` in DIDI-996.

## Decision

### Core architecture (DIDI-996 skeleton)

1. **Language:** TypeScript (strict, ESM, Node 22+ for local runs).
2. **HTTP surface:** A single web-standard `handleRequest(request: Request): Promise<Response>` in `src/http/`. Routes and handlers call **services** only; they do not touch storage adapters directly except through injected ports in tests.
3. **Layers (inside `src/`):**
   - **domain** (`src/domain/`): Placeholder until DIDI-997 / DIDI-1000. No I/O, no platform imports.
   - **services** (`src/services/`): Use cases shared by the web app and MCP server. Depend on storage **ports** only.
   - **storage** (`src/storage/ports/`): Interfaces for SQLite-compatible SQL and object media storage. **In-memory fakes** (`src/storage/adapters/memory/`) for unit tests in this PR. Real D1, R2, and S3-compatible adapters land with bindings tickets.
   - **http** (`src/http/`): Routing and JSON responses using `Request` / `Response`.
   - **ui** (`src/ui/`): Web UI shell (React with Vite static assets; mobile first at 390 px; desktop at 1280 px).
   - **entry** (`src/entry/`): Thin Cloudflare Workers and Node HTTP entries.
   - **adapters** (`src/adapters/node/`, `src/adapters/workers/`): Platform-specific adapter wiring only (empty until binding tickets).
4. **Platform imports:** Allowed only in `src/entry/**` and `src/adapters/{node,workers}/**`. All other paths under `src/` (including `src/ui/` and future `src/mcp-connector/`) must stay platform-free; an automated import guard enforces this.
5. **MCP integration:** The MCP server (DIDI-991) calls the same **services** as the web app. Tool inputs and outputs stay in **`src/mcp-connector/`** (DIDI-989). Handlers validate with the contract, call services, and shape responses. Web app base URL for `manage_url` / `search_link` comes from server config, not from tool arguments.

### CTO answers (Oct 29, 2026)

6. **UI stack.** React with Vite, built to static assets that the same entry serves. No SSR framework.
7. **Auth.** Use the DIDI-1001 default behind an `AuthPort`. That's a single practitioner with a password hash in a secret and an HttpOnly, Secure, SameSite=Lax signed session cookie. It's swappable later.
8. **Program name and title (corrected 3:51 PM ET).** These are the same field, `title`. Title is **optional** per DIDI-594. When present, it is trimmed, 1 to 80 characters, non-identifying, and run through the shared patient-detail validator from DIDI-989. (The earlier ADR draft implied title was always required; that is withdrawn.)
9. **SQL.** Write a portable SQL subset with SQLite (D1) migrations in the bindings ticket. DIDI-996 tests use plain TypeScript in-memory fakes only. A Postgres adapter is deferred to the Kubernetes migration planning ticket.
10. **Object storage.** The port includes put, get, head, and delete now. **Time-limited signed URLs** are added in the bindings ticket together with real R2 or S3 adapters. Nothing R2-specific goes beyond the adapter.
11. **Dependencies.** One shared `createAppDependencies(config, adapters)` builds AppDependencies. Each entry reads its own env and passes in adapters, and nothing else reads env.
12. **Workers hosting.** One Worker hosts the UI, REST and MCP, routed by path. That's simplest for a POC, and it can be split later.
13. **MCP endpoint.** `/mcp` on the Worker's workers.dev hostname. No custom domain for now, since any DNS change needs Diadem's approval.
14. **Kubernetes cutover.** Out of scope here. Diadem sets it with the migration planning ticket.
15. **PDF and media.** PDF is browser print from the link page (DIDI-1015 default). Media generation runs only in the gated main-branch workflow from the DIDI-999 ruling, never in the app request path.
16. **practitioner_id.** A server-generated opaque id (UUID), created once by the bootstrap or migration seed for the single practitioner. It's never derived from an email or name.

### Sign-off (QA round 1, CTO 3:51 PM ET)

With domain types deferred and only generic ports in DIDI-996, this PR is not a data-model, migration, binding, or secret change and needs **no CTO sign-off to merge**. If a schema, binding, or secret change returns, CTO head-pinned sign-off is required again.

## Reasons

- Workers and Node both provide `fetch`, `Request`, and `Response`, so one handler serves both runtimes.
- Ports keep D1/R2 on Workers and SQLite/S3-compatible storage on other hosts as adapter swaps without rewriting services.
- Sharing services between HTTP UI/API and MCP avoids divergent business rules.
- Separating `src/mcp-connector/` keeps JSON Schema and patient-detail guards testable without a live MCP host.
- TypeScript fakes keep DIDI-996 free of SQLite binaries; `better-sqlite3` waits for DIDI-997.

## Consequences

- New features land in **services** first; HTTP, UI, and MCP are thin adapters.
- `createAppDependencies` becomes the single composition root when implemented; entries supply platform adapters only.
- Deploy, wrangler bindings, migrations, secrets, auth implementation, screens, MCP route wiring, and signed object URLs remain follow-up tickets.
- Import guard scans all portable source extensions under `src/` except the two platform adapter trees and `src/entry/`.
