import { existsSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

export type WranglerUiAssetsFixture = {
  cleanup: () => void;
};

/** Minimal dist/ui so wrangler local dev and dry-run can load wrangler.jsonc assets. */
export function ensureWranglerUiAssetsDirectory(
  root = REPO_ROOT,
): WranglerUiAssetsFixture {
  const dir = join(root, "dist/ui");
  const indexPath = join(dir, "index.html");
  const hadIndex = existsSync(indexPath);
  mkdirSync(dir, { recursive: true });
  if (!hadIndex) {
    writeFileSync(indexPath, "<!DOCTYPE html><html></html>", "utf8");
  }
  return {
    cleanup() {
      if (!hadIndex && existsSync(indexPath)) {
        rmSync(dir, { recursive: true, force: true });
        const distRoot = join(root, "dist");
        if (existsSync(distRoot)) {
          try {
            rmSync(distRoot, { recursive: true, force: true });
          } catch {
            // ignore
          }
        }
      }
    },
  };
}
