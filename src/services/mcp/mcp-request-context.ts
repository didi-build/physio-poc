/**
 * Request-scoped MCP auth context (set by http/app after session or bearer auth).
 */

export const PHYSIO_MCP_PRACTITIONER_ID_HEADER = "x-physio-mcp-practitioner-id";

export function attachMcpPractitionerId(
  request: Request,
  practitionerId: string,
): Request {
  const headers = new Headers(request.headers);
  headers.set(PHYSIO_MCP_PRACTITIONER_ID_HEADER, practitionerId);
  return new Request(request, { headers });
}

export function readMcpPractitionerId(request: Request): string | null {
  const value = request.headers.get(PHYSIO_MCP_PRACTITIONER_ID_HEADER);
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
