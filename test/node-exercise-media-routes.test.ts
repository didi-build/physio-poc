import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { nodeExerciseMediaRouteHandlers } from "../src/entry/node.js";
import { exerciseMediaHttpRouteCases } from "../src/http/routes/exercise-media.js";
import { MCP_TEST_CONFIG } from "./mcp-server-test-utils.js";
import { InMemoryObjectStorage } from "../src/storage/adapters/memory/in-memory-object-storage.js";
import { InMemorySqlStorage } from "../src/storage/adapters/memory/in-memory-sql-storage.js";
import { createPhysioMcpHttpHandler } from "../src/adapters/workers/mcp/handle-mcp-http-request.js";

describe("Node exercise media route registration (unit)", () => {
  it("registers media handlers only for exact development and test NODE_ENV", () => {
    expect(nodeExerciseMediaRouteHandlers("development")).toHaveLength(1);
    expect(nodeExerciseMediaRouteHandlers("test")).toHaveLength(1);
    expect(nodeExerciseMediaRouteHandlers(undefined)).toEqual([]);
    expect(nodeExerciseMediaRouteHandlers("staging")).toEqual([]);
    expect(nodeExerciseMediaRouteHandlers("Development")).toEqual([]);
    expect(nodeExerciseMediaRouteHandlers("TEST")).toEqual([]);
    expect(nodeExerciseMediaRouteHandlers("production")).toEqual([]);
  });

  it("does not serve media paths through handleRequest without extraRouteHandlers", async () => {
    const mediaCase = exerciseMediaHttpRouteCases()[0];
    expect(mediaCase).toBeDefined();
    const response = await handleRequest(
      new Request(`http://127.0.0.1${mediaCase?.path}`, { method: mediaCase?.method }),
      {
        sql: new InMemorySqlStorage(),
        objects: new InMemoryObjectStorage(),
        config: MCP_TEST_CONFIG,
        mcp: createPhysioMcpHttpHandler(MCP_TEST_CONFIG),
      },
    );
    expect(response.status).toBe(404);
  });
});
