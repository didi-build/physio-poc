# 0004. Portable runtime, storage ports, and shared services

- **Status:** accepted
- **Date:** 2026-10-29

## Context

Physio POC must ship on Cloudflare Workers first (DIDI-990) with a path to Kubernetes later, expose one remote MCP server over Streamable HTTP on a public HTTPS URL (DIDI-594), and keep domain logic free of platform bindings. The CTO data model stores exercise and program row params as JSON TEXT in D1-compatible SQL. The hard rule is that nothing stores patient information; programs are identified by our own id or code and an optional non-identifying title. Design specs live under `design/` (squash `1a82b7d`); MCP tool JSON Schema lives in `src/mcp-connector/` (DIDI-989, PR physio-poc#6).

## Decision

1. **Language:** TypeScript (strict, ESM, Node 22+ for local runs).
2. **HTTP surface:** A single web-standard `handleRequest(request: Request): Promise<Response>` in `src/http/`. Routes and handlers call **services** only; they do not touch storage adapters directly except through injected ports in tests.
3. **Layers (inside `src/`):**
   - **domain** (`src/domain/`): Types and invariants. No I/O, no platform imports.
   - **services** (`src/services/`): Use cases shared by the web app and MCP server. Depend on storage **ports** only.
   - **storage** (`src/storage/ports/`): Interfaces for SQLite-compatible SQL and object media storage. **Adapters** (`src/storage/adapters/`) implement ports (D1, R2, Postgres, S3 later; **in-memory** for unit tests now).
   - **http** (`src/http/`): Routing and JSON responses using `Request` / `Response`.
   - **ui** (`src/ui/`): Web UI shell and components (mobile first at 390 px; desktop layouts at 1280 px per `design/README.md`). Not implemented in DIDI-996.
   - **entry** (`src/entry/`): Thin **Cloudflare Workers** default export (`fetch`) and **Node** HTTP server for local dev and future Kubernetes. Only entry files may import Node or Workers runtime APIs.
4. **SQL port:** `SqlStoragePort` exposes `run`, `all`, and `first` with positional bindings, matching how D1 and better-sqlite3 are used. Table shapes and JSON TEXT columns follow the locked product direction in design specs; migrations and D1 binding are a follow-up ticket.
5. **Object storage port:** `ObjectStoragePort` stores exercise media blobs by opaque key (no patient metadata in keys or metadata maps).
6. **MCP integration:** The MCP server (DIDI-991) will call the same **services** as the web app. Tool inputs and outputs stay in **`src/mcp-connector/`** (runtime-neutral contract from DIDI-989). Handlers validate with the contract, map to service calls, and map results back to tool JSON. Web app base URL for `manage_url` / `search_link` comes from server config, not from tool arguments.
7. **UI approach:** Mobile first at **390 px** width; desktop mockups and builder layout at **1280 px** (`design/README.md`). Reference TSX under `design/reference/` is design-only until UI tickets implement `src/ui/`.

## Reasons

- Workers and Node both provide `fetch`, `Request`, and `Response`, so one handler serves both runtimes.
- Ports keep D1/R2 on Workers and SQLite/Postgres/S3 on Kubernetes as adapter swaps without rewriting services.
- Sharing services between HTTP UI/API and MCP avoids divergent business rules.
- Separating `src/mcp-connector/` keeps JSON Schema and patient-detail guards testable without a live MCP host.

## Consequences

- New features land in **services** first; HTTP, UI, and MCP are thin adapters.
- Tests use **in-memory** SQL and object storage adapters under `src/storage/adapters/memory/`.
- Deploy, wrangler bindings, migrations, sign-in, screens, and MCP hosting remain out of scope until their tickets land.
- If DIDI-989 is not merged when building MCP, import the contract from `src/mcp-connector/` once that PR merges; until then, services should expose stable TypeScript APIs documented in `docs/architecture/overview.md` so MCP handlers can plug in without duplicating logic.

## Open questions (for CTO)

See the pull request body section **Open questions for CTO** for the live list tied to DIDI-996.
