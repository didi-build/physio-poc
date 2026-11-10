import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(import.meta.dirname, "..", "..");

const PLACEHOLDER_HTML = "<!DOCTYPE html><html></html>";
const LOCK_DIR_NAME = ".wrangler-ui-assets-lock";
const LEASE_FILE_NAME = ".wrangler-ui-assets-lease.json";

type LeaseState = {
  refs: number;
  hadIndexBeforeLease: boolean;
};

export type WranglerUiAssetsFixture = {
  cleanup: () => void;
};

function distUiPaths(root: string) {
  const dir = join(root, "dist/ui");
  const indexPath = join(dir, "index.html");
  const distRoot = join(root, "dist");
  const lockDir = join(distRoot, LOCK_DIR_NAME);
  const leasePath = join(distRoot, LEASE_FILE_NAME);
  return { dir, indexPath, distRoot, lockDir, leasePath };
}

function acquireLock(lockDir: string, maxWaitMs = 30_000): void {
  const deadline = Date.now() + maxWaitMs;
  while (Date.now() < deadline) {
    try {
      mkdirSync(lockDir);
      return;
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (code !== "EEXIST") {
        throw err;
      }
    }
  }
  throw new Error(`Timed out acquiring wrangler ui assets lock: ${lockDir}`);
}

function releaseLock(lockDir: string): void {
  rmSync(lockDir, { recursive: true, force: true });
}

function readLease(leasePath: string): LeaseState | null {
  if (!existsSync(leasePath)) {
    return null;
  }
  return JSON.parse(readFileSync(leasePath, "utf8")) as LeaseState;
}

function writeLease(leasePath: string, state: LeaseState): void {
  writeFileSync(leasePath, JSON.stringify(state), "utf8");
}

function withLease<T>(root: string, fn: () => T): T {
  const { distRoot, lockDir } = distUiPaths(root);
  mkdirSync(distRoot, { recursive: true });
  acquireLock(lockDir);
  try {
    return fn();
  } finally {
    releaseLock(lockDir);
  }
}

/** Minimal dist/ui so wrangler local dev and dry-run can load wrangler.jsonc assets. */
export function ensureWranglerUiAssetsDirectory(
  root = REPO_ROOT,
): WranglerUiAssetsFixture {
  withLease(root, () => {
    const { dir, indexPath, leasePath } = distUiPaths(root);
    const lease = readLease(leasePath);
    const nextRefs = (lease?.refs ?? 0) + 1;
    const hadIndexBeforeLease = lease?.hadIndexBeforeLease ?? existsSync(indexPath);
    writeLease(leasePath, { refs: nextRefs, hadIndexBeforeLease });
    mkdirSync(dir, { recursive: true });
    if (!hadIndexBeforeLease && !existsSync(indexPath)) {
      writeFileSync(indexPath, PLACEHOLDER_HTML, "utf8");
    }
  });

  return {
    cleanup() {
      withLease(root, () => {
        const { dir, indexPath, distRoot, leasePath } = distUiPaths(root);
        const lease = readLease(leasePath);
        if (!lease || lease.refs <= 0) {
          return;
        }
        const nextRefs = lease.refs - 1;
        if (nextRefs > 0) {
          writeLease(leasePath, { ...lease, refs: nextRefs });
          return;
        }
        rmSync(leasePath, { force: true });
        if (!lease.hadIndexBeforeLease && existsSync(indexPath)) {
          rmSync(dir, { recursive: true, force: true });
          if (existsSync(distRoot)) {
            try {
              rmSync(distRoot, { recursive: true, force: true });
            } catch {
              // ignore
            }
          }
        }
      });
    },
  };
}
