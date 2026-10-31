import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { summarizeVitestJUnitXml } from "../scripts/lib/parse-vitest-junit.mjs";

/** Trimmed Vitest JUnit shape for ci-test-summary (not a full CI export). */
const FIXTURE_JUNIT = join(
  import.meta.dirname,
  "fixtures/vitest-junit-summary.fixture.xml",
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

  it("uses trimmed fixture literals for skipped and failure totals", () => {
    const fixtureXml = readFileSync(FIXTURE_JUNIT, "utf8");
    const summary = summarizeVitestJUnitXml(fixtureXml);
    expect(summary.tests).toBe(1504);
    expect(summary.skipped).toBe(4);
    expect(summary.failures).toBe(1);
    expect(summary.errors).toBe(1);
    expect(summary.failed).toBe(2);
    expect(summary.executed).toBe(1500);
    expect(summary.passed).toBe(1498);

    const body = runSummary({
      INSTALL_OUTCOME: "success",
      CHECK_OUTCOME: "success",
      PR_HEAD_SHA: "deadbeef00000000",
      VITEST_JUNIT_PATH: FIXTURE_JUNIT,
    });
    expect(body).toContain("1498/1500 passed (2 failed)");
    expect(body).not.toContain("1498/1503 passed");
    expect(body).not.toContain("1499/1499 passed");
  });
});
