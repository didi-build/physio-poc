import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");
const PACKAGE_JSON = join(REPO_ROOT, "package.json");
const LOCK_PATH = join(REPO_ROOT, "package-lock.json");

type Lockfile = {
  packages: Record<
    string,
    {
      devDependencies?: Record<string, string>;
      version?: string;
    }
  >;
};

describe("package-lock @cloudflare/workers-types order (DIDI-1240)", () => {
  it("keeps workers-types sorted in the lockfile without changing package.json", () => {
    const pkg = JSON.parse(readFileSync(PACKAGE_JSON, "utf8")) as {
      devDependencies?: Record<string, string>;
    };
    expect(pkg.devDependencies?.["@cloudflare/workers-types"]).toBe("5.20261104.1");

    const lock = JSON.parse(readFileSync(LOCK_PATH, "utf8")) as Lockfile;
    const rootDevDeps = lock.packages[""]?.devDependencies;
    expect(rootDevDeps?.["@cloudflare/workers-types"]).toBe("5.20261104.1");
    const devDepKeys = Object.keys(rootDevDeps ?? {});
    expect(devDepKeys).toEqual([...devDepKeys].sort());

    const cloudflarePackageKeys = Object.keys(lock.packages).filter((key) =>
      key.startsWith("node_modules/@cloudflare/"),
    );
    expect(cloudflarePackageKeys).toEqual([...cloudflarePackageKeys].sort());
    expect(cloudflarePackageKeys).toContain("node_modules/@cloudflare/workers-types");
    expect(
      cloudflarePackageKeys.indexOf("node_modules/@cloudflare/workers-types"),
    ).toBeGreaterThan(
      cloudflarePackageKeys.indexOf("node_modules/@cloudflare/workerd-windows-64"),
    );
    expect(lock.packages["node_modules/@cloudflare/workers-types"]?.version).toBe(
      "5.20261104.1",
    );
  });
});
