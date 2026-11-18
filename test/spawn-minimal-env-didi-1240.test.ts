import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");

const SPAWN_MINIMAL_ENV_TARGETS = [
  {
    path: "test/nodrift-deploy-wrangler-bindings.test.ts",
    spawnEnvCallCount: 3,
  },
  {
    path: "test/r2-binding-production-deploy.test.ts",
    spawnEnvCallCount: 2,
  },
] as const;

function assertEverySpawnEnvUsesMinimalHelper(source: string, label: string): number {
  expect(source, label).not.toMatch(/env:\s*process\.env\b/);
  expect(source, label).not.toMatch(/env:\s*\{\s*\.\.\.process\.env/);
  expect(source, label).not.toMatch(/childProcess\.spawnSync\(/);

  const spawnChunks = source.split("spawnSyncRecording").slice(1);
  let envSpawnCount = 0;
  for (const chunk of spawnChunks) {
    const envIndex = chunk.indexOf("env:");
    if (envIndex === -1) {
      continue;
    }
    const envLineEnd = chunk.indexOf("\n", envIndex);
    const envLine =
      envLineEnd === -1 ? chunk.slice(envIndex) : chunk.slice(envIndex, envLineEnd);
    expect(envLine, label).toMatch(/env:\s*minimalChildProcessEnv/);
    expect(envLine, label).not.toMatch(/\.\.\.process\.env/);
    expect(envLine, label).not.toMatch(/env:\s*process\.env\b/);
    envSpawnCount += 1;
  }
  return envSpawnCount;
}

describe("spawn minimal env guard (DIDI-1240)", () => {
  it("uses minimalChildProcessEnv on every spawnSyncRecording env in nodrift and r2 deploy tests", () => {
    for (const target of SPAWN_MINIMAL_ENV_TARGETS) {
      const source = readFileSync(join(REPO_ROOT, target.path), "utf8");
      const count = assertEverySpawnEnvUsesMinimalHelper(source, target.path);
      expect(count, target.path).toBe(target.spawnEnvCallCount);
    }
  });
});
