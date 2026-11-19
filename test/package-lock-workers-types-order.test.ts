import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");
const PACKAGE_JSON = join(REPO_ROOT, "package.json");
const LOCK_PATH = join(REPO_ROOT, "package-lock.json");
const WORKERS_TYPES = "@cloudflare/workers-types";
const WORKERS_TYPES_PACKAGE = "node_modules/@cloudflare/workers-types";

type Lockfile = {
  packages: Record<
    string,
    {
      devDependencies?: Record<string, string>;
      version?: string;
    }
  >;
};

function localeSort(keys: string[]): string[] {
  return [...keys].sort((a, b) => a.localeCompare(b, "en"));
}

describe("package-lock @cloudflare/workers-types order (DIDI-1240)", () => {
  it("keeps workers-types sorted and aligned across package.json and package-lock.json", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    const pkgVersion = pkg.devDependencies?.[WORKERS_TYPES];
    expect(pkgVersion).toBeDefined();

    const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as Lockfile;
    const rootDevDeps = lock.packages[""]?.devDependencies;
    expect(rootDevDeps?.[WORKERS_TYPES]).toBe(pkgVersion);

    const devDepKeys = Object.keys(rootDevDeps ?? {});
    expect(devDepKeys).toEqual(localeSort(devDepKeys));

    const cloudflarePackageKeys = Object.keys(lock.packages).filter((key) =>
      key.startsWith("node_modules/@cloudflare/"),
    );
    expect(cloudflarePackageKeys).toEqual(localeSort(cloudflarePackageKeys));
    expect(cloudflarePackageKeys).toContain(WORKERS_TYPES_PACKAGE);
    expect(cloudflarePackageKeys.indexOf(WORKERS_TYPES_PACKAGE)).toBeGreaterThan(
      cloudflarePackageKeys.indexOf("node_modules/@cloudflare/workerd-windows-64"),
    );
    expect(lock.packages[WORKERS_TYPES_PACKAGE]?.version).toBe(pkgVersion);
  });
});
