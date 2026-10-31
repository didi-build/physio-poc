import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeVitestJUnitXml } from "../scripts/lib/parse-vitest-junit.mjs";

const FIXTURE_JUNIT = join(
  import.meta.dirname,
  "fixtures/vitest-junit-from-ci-run.xml",
);

function runSummary(env: Record<string, string>) {
  const out = execFileSync("node", ["scripts/ci-test-summary.mjs"], {
    env: { ...process.env, ...env },
    encoding: "utf8",
  });
  const match = out.match(/body<<EOF\n([\s\S]*?)\nEOF/);
  return match?.[1] ?? "";
}

describe("ci-test-summary (unit)", () => {
  it("reports install failure clearly for Dependabot-style CI", () => {
    const body = runSummary({
      INSTALL_OUTCOME: "failure",
      CHECK_OUTCOME: "skipped",
      PR_HEAD_SHA: "abcdef1234567890",
    });
    expect(body).toContain("<!-- launchpad-vitest-results -->");
    expect(body).toContain("npm ci");
    expect(body).toContain("dependency install failed");
    expect(body).toContain("`abcdef1`");
    expect(body).not.toContain("Vitest");
  });

  it("includes check outcome when install succeeds", () => {
    const body = runSummary({
      INSTALL_OUTCOME: "success",
      CHECK_OUTCOME: "success",
      PR_HEAD_SHA: "deadbeef00000000",
    });
    expect(body).toContain("**check**");
    expect(body).toContain("`success`");
    expect(body).toContain("attribution");
  });

  it("excludes skipped tests using per-testsuite skipped counts from real Vitest JUnit", () => {
    const fixtureXml = readFileSync(FIXTURE_JUNIT, "utf8");
    const summary = summarizeVitestJUnitXml(fixtureXml);
    expect(summary.skipped).toBeGreaterThan(0);
    expect(summary.executed).toBe(summary.tests - summary.skipped);

    const body = runSummary({
      INSTALL_OUTCOME: "success",
      CHECK_OUTCOME: "success",
      PR_HEAD_SHA: "deadbeef00000000",
      VITEST_JUNIT_PATH: FIXTURE_JUNIT,
    });
    expect(body).toContain(
      `${summary.passed}/${summary.executed} passed (${summary.failed} failed)`,
    );
    expect(body).not.toContain(`${summary.passed}/${summary.tests} passed`);
  });
});
