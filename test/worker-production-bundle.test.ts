import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { readdir, readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { describe, expect, it } from "vitest";

const REPO_ROOT = process.cwd();
const WRANGLER_PATH = join(REPO_ROOT, "wrangler.jsonc");

const FORBIDDEN_BUNDLE_MARKERS = [
  "fake-google-http",
  "fake-google-better-auth",
  "handleFakeGoogleRequest",
  "installFakeGoogleFetch",
  "__fake-google",
  "fake-google-oauth",
] as const;

const REQUIRED_BUNDLE_MARKERS = [
  "src/entry/worker.ts",
  "src/adapters/workers/create-worker-production-app-dependencies.ts",
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
  it("dry-run bundles the production Worker entry and production auth module", async () => {
    const wrangler = parseWranglerJsonc(readFileSync(WRANGLER_PATH, "utf8"));
    expect(wrangler.main).toBe("src/entry/worker.ts");

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
      for (const marker of REQUIRED_BUNDLE_MARKERS) {
        expect(combined).toContain(marker);
      }
      for (const marker of FORBIDDEN_BUNDLE_MARKERS) {
        expect(combined).not.toContain(marker);
      }
    } finally {
      await rm(outdir, { recursive: true, force: true });
    }
  }, 120_000);

  it("rejects a wrangler main entry mutation (X14) via the bundle marker assertion", () => {
    const wrangler = parseWranglerJsonc(readFileSync(WRANGLER_PATH, "utf8"));
    expect(wrangler.main).not.toBe("src/entry/node.ts");
    expect(wrangler.main).toBe("src/entry/worker.ts");
  });
});

function parseWranglerJsonc(text: string): { main?: string } {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => printParseErrorCode(entry.error)).join(", "));
  }
  return parsed as { main?: string };
}
