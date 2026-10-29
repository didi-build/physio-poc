# MCP connector tool contract

Runtime-neutral JSON Schema definitions for the Physio MCP connector. Implements DIDI-989; server and data are follow-up work (DIDI-991 and later).

## Location

- Module: `src/mcp-connector/`
- Tool list doc: `docs/mcp-connector/tools.md`

## Tools (locked product direction)

Exactly four tools; no exercise creation; no patient-identifying fields in any schema.

## Privacy

Schemas allow only non-identifying program titles and exercise-focused row notes. A unit test rejects patient-related property names and pins the allowed property set per tool.

## Platform

The contract module must not import Node, Cloudflare Workers, or other runtime-specific packages. Verified by test.
