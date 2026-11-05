import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const REPO_ROOT = join(import.meta.dirname, "..");

function grepProduction(literal: string): string[] {
  try {
    const out = execFileSync("git", ["grep", "-l", "-F", literal, "--", "src"], {
      encoding: "utf8",
      cwd: REPO_ROOT,
    });
    return out
      .trim()
      .split("\n")
      .filter(Boolean)
      .map((file) => file.replace(/^\.\//, ""))
      .sort();
  } catch (error) {
    const status = (error as { status?: number }).status;
    if (status === 1) {
      return [];
    }
    throw error;
  }
}

describe("Exercise request approve placeholder linking callers (DIDI-1137)", () => {
  it("invokes linkApprovedPlaceholders only from the exercise request approve service", () => {
    const files = grepProduction(".linkApprovedPlaceholders(");
    expect(files).toEqual([
      "src/services/exercise-requests/exercise-requests-service.ts",
      "src/services/programs/program-builder-service.ts",
    ]);
  });

  it("does not invoke linkPlaceholderRowToApprovedVersion in production code", () => {
    const files = grepProduction(".linkPlaceholderRowToApprovedVersion(");
    expect(files).toEqual([]);
  });

  it("invokes buildLinkApprovedPlaceholderStatements only inside program-builder-service", () => {
    const files = grepProduction(".buildLinkApprovedPlaceholderStatements(");
    expect(files).toEqual(["src/services/programs/program-builder-service.ts"]);
  });
});
