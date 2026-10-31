import { describe, expect, it } from "vitest";
import { handleRequest } from "../src/http/app.js";
import { nodeExerciseMediaRouteHandlers } from "../src/entry/node.js";
import { exerciseMediaHttpRouteCases } from "../src/http/routes/exercise-media.js";
import { createTestAppDependencies } from "./mcp-server-test-utils.js";

describe("Node exercise media route registration (unit)", () => {
  it("registers media handlers only for exact development and test NODE_ENV", () => {
    expect(nodeExerciseMediaRouteHandlers("development")).toHaveLength(1);
    expect(nodeExerciseMediaRouteHandlers("test")).toHaveLength(1);
    expect(nodeExerciseMediaRouteHandlers(undefined)).toEqual([]);
    expect(nodeExerciseMediaRouteHandlers("")).toEqual([]);
    expect(nodeExerciseMediaRouteHandlers("staging")).toEqual([]);
    expect(nodeExerciseMediaRouteHandlers("Development")).toEqual([]);
    expect(nodeExerciseMediaRouteHandlers("TEST")).toEqual([]);
    expect(nodeExerciseMediaRouteHandlers("production")).toEqual([]);
  });

  it("returns 401 for media API paths without a session when extraRouteHandlers are absent", async () => {
    const mediaCase = exerciseMediaHttpRouteCases()[0];
    expect(mediaCase).toBeDefined();
    const response = await handleRequest(
      new Request(`http://127.0.0.1${mediaCase?.path}`, { method: mediaCase?.method }),
      createTestAppDependencies(),
    );
    expect(response.status).toBe(401);
  });
});
