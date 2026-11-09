import type { PhysioServerConfig } from "../../http/config.js";
import type { SqlStoragePort } from "../../storage/ports/sql-storage.js";
import {
  SEARCH_ROUTINES_TOOL_NAME,
  type PhysioMcpToolName,
} from "../../mcp-connector/index.js";
import { readMcpPractitionerId } from "./mcp-request-context.js";
import { PhysioMcpToolService } from "./physio-mcp-tool-service.js";
import {
  PhysioMcpStructuredToolError,
  validatePhysioMcpToolInput,
} from "./validate-tool-input.js";

export type PhysioMcpHttpDeps = {
  readonly config: PhysioServerConfig;
  readonly sql: SqlStoragePort;
};

export async function invokePhysioMcpTool(
  toolName: string,
  args: unknown,
  request: Request,
  deps: PhysioMcpHttpDeps,
): Promise<Record<string, unknown>> {
  const input = validatePhysioMcpToolInput(toolName, args);
  const name = toolName as PhysioMcpToolName;

  if (name === SEARCH_ROUTINES_TOOL_NAME) {
    const practitionerId = requireMcpPractitionerId(request);
    const service = new PhysioMcpToolService({
      practitionerId,
      config: deps.config,
      sql: deps.sql,
    });
    return service.searchRoutines(input);
  }

  const practitionerId = requireMcpPractitionerId(request);

  const service = new PhysioMcpToolService({
    practitionerId,
    config: deps.config,
    sql: deps.sql,
  });
  return service.invokeTool(name, input);
}

function requireMcpPractitionerId(request: Request): string {
  const practitionerId = readMcpPractitionerId(request);
  if (!practitionerId) {
    throw new PhysioMcpStructuredToolError({ error_code: "auth_required" });
  }
  return practitionerId;
}

/** @deprecated Use invokePhysioMcpTool. Retained for stub unit tests. */
export { invokePhysioMcpStubTool } from "./stub-tool-handler.js";
