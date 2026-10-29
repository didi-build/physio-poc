# MCP connector tool contract

Runtime-neutral JSON Schema definitions for the Physio MCP connector. Implements DIDI-989; server and data are follow-up work (DIDI-991 and later).

## Location

- Module: `src/mcp-connector/`
- Tool list doc: `docs/mcp-connector/tools.md`

## Tools (locked product direction)

Exactly four tools; no exercise creation; no patient-identifying field names in any schema. Delete and link expiry are web app only in v1.

## Privacy

Enforcement is structural, not full content scanning: JSON Schema maxLength caps on free-text fields, property names must not match patient-info patterns (unit test), each tool's property set is pinned, field descriptions forbid patient details, and `validateFreeTextForPatientDetails` in the contract rejects obvious emails, phone numbers, Ontario health-card-shaped numbers, and date-of-birth-like dates (DIDI-991 runs this on the server). This is a regression guard, not a privacy guarantee.

## Platform

The contract module must not import Node, Cloudflare Workers, or other runtime-specific packages. Verified by test.
