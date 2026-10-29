# 0004. Portable runtime, storage ports, and shared services

- **Status:** accepted
- **Date:** 2026-10-29
- **Decided by:** CTO (Oct 29, 2026), recorded from [physio-poc#7](https://github.com/didi-build/physio-poc/pull/7#issuecomment) and Linear DIDI-996

## Context

Physio POC must ship on Cloudflare Workers first (DIDI-990) with a path to Kubernetes later, expose one remote MCP server over Streamable HTTP on a public HTTPS URL (DIDI-594), and keep domain logic free of platform bindings. The CTO data model stores exercise and program row params as JSON TEXT in D1-compatible SQL. The hard rule is that nothing stores patient information; programs are identified by our own id or code and an optional non-identifying title. Design specs live under `design/` (squash `1a82b7d`); MCP tool JSON Schema lives in `src/mcp-connector/` (DIDI-989, PR physio-poc#6).

## Decision

### Core architecture (DIDI-996 skeleton)

1. **Language:** TypeScript (strict, ESM, Node 22+ for local runs).
2. **HTTP surface:** A single web-standard `handleRequest(request: Request): Promise<Response>` in `src/http/`. Routes and handlers call **services** only; they do not touch storage adapters directly except through injected ports in tests.
3. **Layers (inside `src/`):**
   - **domain** (`src/domain/`): Types and invariants. No I/O, no platform imports.
   - **services** (`src/services/`): Use cases shared by the web app and MCP server. Depend on storage **ports** only.
   - **storage** (`src/storage/ports/`): Interfaces for SQLite-compatible SQL and object media storage. **Adapters** (`src/storage/adapters/`) implement ports (D1, R2, S3-compatible stores later; **in-memory** for unit tests now).
   - **http** (`src/http/`): Routing and JSON responses using `Request` / `Response`.
   - **ui** (`src/ui/`): Web UI shell and components (mobile first at 390 px; desktop layouts at 1280 px per `design/README.md`).
   - **entry** (`src/entry/`): Thin **Cloudflare Workers** default export (`fetch`) and **Node** HTTP server for local dev and future Kubernetes. Only entry files may import Node or Workers runtime APIs.
4. **MCP integration:** The MCP server (DIDI-991) will call the same **services** as the web app. Tool inputs and outputs stay in **`src/mcp-connector/`** (runtime-neutral contract from DIDI-989). Handlers validate with the contract, map to service calls, and map results back to tool JSON. Web app base URL for `manage_url` / `search_link` comes from server config, not from tool arguments.
5. **UI layout:** Mobile first at **390 px** width; desktop mockups and builder layout at **1280 px** (`design/README.md`). Reference TSX under `design/reference/` is design-only until UI tickets implement `src/ui/`.

### CTO decisions (ADR review, Oct 29, 2026)

6. **UI stack.** React with Vite, built to static assets that the same entry serves. No SSR framework.
7. **Auth.** Use the DIDI-1001 default behind an `AuthPort`. That's a single practitioner with a password hash in a secret and an HttpOnly, Secure, SameSite=Lax signed session cookie. It's swappable later.
8. **Program name and title.** These are the same field, `title`: trimmed, 1 to 80 characters, a non-identifying title, and run through the shared patient-detail validator from DIDI-989.
9. **SQL.** Write a portable SQL subset with SQLite (D1) migrations now. Tests run on in-memory SQLite. A Postgres adapter is deferred to the Kubernetes migration planning ticket.
10. **Object storage.** The port is limited to put, get, head, delete and time-limited URLs, so it maps to both R2 and any S3-compatible store. Nothing R2-specific goes beyond the adapter.
11. **Dependencies.** One shared `createAppDependencies(config, adapters)` builds AppDependencies. Each entry reads its own env and passes in adapters, and nothing else reads env.
12. **Workers hosting.** One Worker hosts the UI, REST and MCP, routed by path. That's simplest for a POC, and it can be split later.
13. **MCP endpoint.** `/mcp` on the Worker's workers.dev hostname. No custom domain for now, since any DNS change needs Diadem's approval.
14. **Kubernetes cutover.** Out of scope here. Diadem sets it with the migration planning ticket.
15. **PDF and media.** PDF is browser print from the link page (DIDI-1015 default). Media generation runs only in the gated main-branch workflow from the DIDI-999 ruling, never in the app request path.
16. **practitioner_id.** A server-generated opaque id (UUID), created once by the bootstrap or migration seed for the single practitioner. It's never derived from an email or name.

The ADR is not privileged and needs no sign-off from the CTO. Tickets that add bindings, migrations, secrets or auth still need CTO head-pinned sign-off.

## Reasons

- Workers and Node both provide `fetch`, `Request`, and `Response`, so one handler serves both runtimes.
- Ports keep D1/R2 on Workers and SQLite/S3-compatible storage on other hosts as adapter swaps without rewriting services.
- Sharing services between HTTP UI/API and MCP avoids divergent business rules.
- Separating `src/mcp-connector/` keeps JSON Schema and patient-detail guards testable without a live MCP host.
- One Worker and one dependency factory reduce POC moving parts; paths and adapters can split when scale requires it.

## Consequences

- New features land in **services** first; HTTP, UI, and MCP are thin adapters.
- Tests move toward **in-memory SQLite** for SQL (replacing the minimal string-matching in-memory adapter over time); object storage tests stay on in-memory or mock adapters until bindings land.
- `createAppDependencies` becomes the single composition root; entries supply platform adapters only.
- Deploy, wrangler bindings, migrations, secrets, auth implementation, screens, and MCP route wiring remain follow-up tickets with CTO sign-off where required.
- If DIDI-989 is not merged when building MCP, import the contract from `src/mcp-connector/` once that PR merges; services expose stable TypeScript APIs so MCP handlers plug in without duplicating logic.
