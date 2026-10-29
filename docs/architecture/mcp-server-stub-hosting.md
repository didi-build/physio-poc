# Physio MCP stub server (DIDI-991)

Remote MCP server over Streamable HTTP on `/mcp`, hosted on Cloudflare Workers (`physio-poc-mcp`). Implements DIDI-989 tool definitions from `src/mcp-connector/` with labelled example responses only; nothing is stored.

## Layout (ADR 0004)

| Path                 | Role                                                        |
| -------------------- | ----------------------------------------------------------- |
| `src/mcp-connector/` | Tool JSON Schema contract (DIDI-989)                        |
| `src/services/mcp/`  | Stub tool handlers and input validation                     |
| `src/http/`          | Web-standard `handleRequest` and MCP Streamable HTTP wiring |
| `src/entry/workers/` | Cloudflare Worker entry                                     |
| `wrangler.jsonc`     | Worker name pin (`physio-poc-mcp`)                          |

Platform-specific code stays under `src/entry/workers/` and `.github/workflows/deploy-physio-mcp-worker.yml`.

## Deploy

- Workflow: `.github/workflows/deploy-physio-mcp-worker.yml`
- Runs on push to `main` or `workflow_dispatch` on `main` only (never on pull requests).
- GitHub Environment: `production` (Diadem approves the first run).
- Secrets (environment secrets on `production` only): `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`.
- Token TTL and expiry are set by Diadem on DIDI-994; check them before the token lapses (no fixed date in this repo).

After deploy, the MCP URL is `https://physio-poc-mcp.<account-subdomain>.workers.dev/mcp` (exact host comes from the Cloudflare dashboard).

## Privacy

No patient information is stored or logged. Request bodies are not logged. Stub responses use made-up exercise and program names only.

## Local tests

Integration tests call `handleRequest` through the MCP Streamable HTTP client (see `test/mcp-server-http.test.ts`). MCP Inspector can target the same `/mcp` path once deployed.
