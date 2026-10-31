import { execFileSync } from "node:child_process";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();

const FORBIDDEN_BUNDLE_MARKERS = [
  "fake-google-http",
  "fake-google-better-auth",
  "handleFakeGoogleRequest",
  "installFakeGoogleFetch",
  "__fake-google",
  "fake-google-oauth",
] as const;

async function listFilesRecursive(dir: string): Promise<string[]> {
  const entries = await readdir(dir, { withFileTypes: true });
  const out: string[] = [];
  for (const entry of entries) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) {
      out.push(...(await listFilesRecursive(path)));
    } else {
      out.push(path);
    }
  }
  return out;
}

describe("Worker production bundle (DIDI-1153)", () => {
  it("dry-run deploy output excludes fake Google modules and markers", async () => {
    const outdir = await mkdtemp(join(tmpdir(), "physio-worker-bundle-"));
    try {
      execFileSync(
        join(REPO_ROOT, "node_modules", ".bin", "wrangler"),
        ["deploy", "--dry-run", "--outdir", outdir],
        {
          cwd: REPO_ROOT,
          stdio: "pipe",
          env: { ...process.env, WRANGLER_SEND_METRICS: "false" },
        },
      );
      const files = await listFilesRecursive(outdir);
      expect(files.length).toBeGreaterThan(0);
      const combined = (
        await Promise.all(
          files
            .filter((file) => !file.endsWith(".map"))
            .map((file) => readFile(file, "utf8")),
        )
      ).join("\n");
      for (const marker of FORBIDDEN_BUNDLE_MARKERS) {
        expect(combined).not.toContain(marker);
      }
    } finally {
      await rm(outdir, { recursive: true, force: true });
    }
  }, 120_000);
});
