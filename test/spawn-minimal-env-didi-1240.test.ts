import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");

const SPAWN_MINIMAL_ENV_TARGETS = [
  {
    path: "test/nodrift-deploy-wrangler-bindings.test.ts",
    spawnEnvCallCount: 2,
  },
  {
    path: "test/r2-binding-production-deploy.test.ts",
    spawnEnvCallCount: 1,
  },
] as const;

function collectSpawnEnvBlocks(source: string): string[] {
  const blocks: string[] = [];
  const chunks = source.split("spawnSyncRecording").slice(1);
  for (const chunk of chunks) {
    const envIndex = chunk.indexOf("env:");
    if (envIndex === -1) {
      continue;
    }
    const afterEnv = chunk.slice(envIndex);
    const closeMatch = afterEnv.match(/^env:\s*([\s\S]*?)\n\s*},\s*\n\s*\)/);
    if (closeMatch) {
      blocks.push(closeMatch[1]!);
    }
  }
  return blocks;
}

function assertEverySpawnEnvUsesMinimalHelper(source: string, label: string): number {
  expect(source, label).not.toMatch(/env:\s*process\.env\b/);
  expect(source, label).not.toMatch(/env:\s*\{\s*\.\.\.process\.env/);
  expect(source, label).not.toMatch(/childProcess\.spawnSync\(/);

  const envBlocks = collectSpawnEnvBlocks(source);
  for (const block of envBlocks) {
    expect(block, label).toMatch(/minimalChildProcessEnv\s*\(/);
    expect(block, label).not.toMatch(/process\.env/);
    expect(block, label).not.toMatch(/CLOUDFLARE_API_TOKEN/);
    expect(block, label).not.toMatch(/GITHUB_TOKEN/);
  }
  return envBlocks.length;
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
