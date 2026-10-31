import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  parse as parseJsonc,
  printParseErrorCode,
  type ParseError,
} from "jsonc-parser";
import { describe, expect, it } from "vitest";
import {
  D1_PLACEHOLDER_PRODUCTION,
  looksLikeCommittedProductionD1Id,
  PHYSIO_D1_BINDING,
  PHYSIO_D1_DATABASE_NAME,
  COMMITTED_WEB_APP_BASE_URL,
} from "../scripts/lib/wrangler-d1-placeholders.mjs";
import { createWorkerAppDependencies } from "../src/adapters/workers/create-app-dependencies.js";
import { D1SqlStorage } from "../src/adapters/workers/d1-sql-storage.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const WRANGLER_PATH = join(REPO_ROOT, "wrangler.jsonc");
const DEPLOY_WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github/workflows/deploy-physio-mcp-worker.yml",
);
const CI_WORKFLOW_PATH = join(REPO_ROOT, ".github/workflows/ci.yml");
const CREATE_DEPS_PATH = join(
  REPO_ROOT,
  "src/adapters/workers/create-app-dependencies.ts",
);

function parseWranglerJsonc(text: string): Record<string, unknown> {
  const errors: ParseError[] = [];
  const parsed = parseJsonc(text, errors, { allowTrailingComma: true });
  if (errors.length > 0) {
    throw new Error(errors.map((entry) => printParseErrorCode(entry.error)).join(", "));
  }
  if (
    parsed === undefined ||
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("Expected wrangler.jsonc root object");
  }
  return parsed as Record<string, unknown>;
}

function readDeployWorkflowText(): string {
  return readFileSync(DEPLOY_WORKFLOW_PATH, "utf8");
}

function readCiWorkflowText(): string {
  return readFileSync(CI_WORKFLOW_PATH, "utf8");
}

function deployJobBlock(workflowText: string): string {
  const jobsIndex = workflowText.indexOf("jobs:");
  if (jobsIndex === -1) {
    throw new Error("deploy workflow missing jobs:");
  }
  return workflowText.slice(jobsIndex);
}

function stepBodiesAfterName(workflowText: string, stepName: string): string[] {
  const needle = `- name: ${stepName}`;
  const bodies: string[] = [];
  let searchFrom = 0;
  while (true) {
    const idx = workflowText.indexOf(needle, searchFrom);
    if (idx === -1) break;
    const runIdx = workflowText.indexOf("\n        run:", idx);
    if (runIdx === -1) {
      throw new Error(`step ${stepName} missing run block`);
    }
    const pipe = workflowText.indexOf("|", runIdx);
    const nextStep = workflowText.indexOf("\n      - ", pipe + 1);
    const end = nextStep === -1 ? workflowText.length : nextStep;
    bodies.push(workflowText.slice(pipe + 1, end));
    searchFrom = end;
  }
  return bodies;
}

function stepIndexByName(jobBlock: string, stepName: string): number {
  const lines = jobBlock.split("\n");
  let stepCount = 0;
  for (const line of lines) {
    if (/^\s+- uses:/.test(line) || /^\s+- name:/.test(line)) {
      stepCount += 1;
    }
    if (line.trim() === `- name: ${stepName}`) {
      return stepCount;
    }
  }
  return -1;
}

describe("D1 binding in wrangler.jsonc (DIDI-1031)", () => {
  it("declares PHYSIO_DB with the production placeholder database_id", () => {
    const parsed = parseWranglerJsonc(readFileSync(WRANGLER_PATH, "utf8"));
    const d1 = parsed.d1_databases as Record<string, unknown>[] | undefined;
    expect(Array.isArray(d1)).toBe(true);
    expect(d1).toHaveLength(1);
    const entry = d1![0]!;
    expect(entry.binding).toBe(PHYSIO_D1_BINDING);
    expect(entry.database_name).toBe(PHYSIO_D1_DATABASE_NAME);
    expect(entry.database_id).toBe(D1_PLACEHOLDER_PRODUCTION);
    expect(looksLikeCommittedProductionD1Id(entry.database_id as string)).toBe(false);
    expect(entry.migrations_dir).toBe("migrations");
  });

  it("pins production WEB_APP_BASE_URL and keeps fake Google provider off in committed vars", () => {
    const parsed = parseWranglerJsonc(readFileSync(WRANGLER_PATH, "utf8"));
    const vars = parsed.vars as Record<string, string> | undefined;
    expect(vars?.WEB_APP_BASE_URL).toBe(COMMITTED_WEB_APP_BASE_URL);
    expect(vars?.PHYSIO_USE_FAKE_GOOGLE_PROVIDER).toBe("false");
  });
});

describe("production deploy workflow (DIDI-1031)", () => {
  const workflowText = readDeployWorkflowText();
  const jobBlock = deployJobBlock(workflowText);

  it("keeps contents read permissions and checkout persist-credentials false", () => {
    expect(workflowText).toMatch(/^permissions:\s*\n\s*contents: read\s*$/m);
    expect(workflowText).toContain("persist-credentials: false");
  });

  it("runs only on main with environment production on the deploy job", () => {
    expect(jobBlock).toContain("if: github.ref == 'refs/heads/main'");
    expect(jobBlock).toContain("environment: production");
  });

  it("substitutes the D1 placeholder from PHYSIO_D1_DATABASE_ID without printing the config", () => {
    const bodies = stepBodiesAfterName(
      workflowText,
      "Prepare Wrangler config (production D1 ID)",
    );
    expect(bodies).toHaveLength(1);
    const body = bodies[0]!;
    expect(body).toContain("PHYSIO_D1_DATABASE_ID");
    expect(body).toContain("::add-mask::");
    expect(body).toContain("prepare-wrangler-config.mjs");
    expect(body).toContain("wrangler.ci.jsonc");
    expect(workflowText).not.toMatch(/vars\.PHYSIO_PRODUCTION_WEB_APP_BASE_URL/);
    expect(body).not.toMatch(/\bcat\b.*wrangler\.ci\.jsonc/);
  });

  it("applies remote D1 migrations before deploy using the prepared config", () => {
    const migrateBodies = stepBodiesAfterName(
      workflowText,
      "Apply production D1 migrations",
    );
    expect(migrateBodies).toHaveLength(1);
    const migrateBody = migrateBodies[0]!;
    expect(migrateBody).toContain("d1 migrations apply PHYSIO_DB --remote");
    expect(migrateBody).toContain("--config wrangler.ci.jsonc");

    const deployStep = workflowText.match(
      /- name: Deploy to Cloudflare Workers[\s\S]*?command: ([^\n]+)/,
    );
    expect(deployStep?.[1]).toBe("deploy --config wrangler.ci.jsonc");

    const migrateIdx = stepIndexByName(jobBlock, "Apply production D1 migrations");
    const deployIdx = stepIndexByName(jobBlock, "Deploy to Cloudflare Workers");
    expect(migrateIdx).toBeGreaterThan(0);
    expect(deployIdx).toBeGreaterThan(migrateIdx);
  });

  it("uses --remote only in the production deploy workflow job", () => {
    expect(workflowText.match(/--remote/g)?.length ?? 0).toBe(1);
    expect(readCiWorkflowText()).not.toContain("--remote");
    expect(readCiWorkflowText()).not.toContain("PHYSIO_D1_DATABASE_ID");
    expect(readCiWorkflowText()).not.toContain("d1 migrations apply");
  });

  it("does not run on pull_request", () => {
    expect(workflowText).not.toMatch(/^\s*pull_request:/m);
  });

  it("orders auth deploy steps validate < prepare < migrate < put < deploy (DIDI-1044)", () => {
    expect(workflowText).toContain("Validate production auth secrets");
    expect(workflowText).toContain("Prepare Wrangler config (production D1 ID)");
    expect(workflowText).toContain("Apply production D1 migrations");
    expect(workflowText).toContain("Put production Worker auth secrets");
    expect(workflowText).toContain("Deploy to Cloudflare Workers");
    const validateIdx = stepIndexByName(jobBlock, "Validate production auth secrets");
    const prepareIdx = stepIndexByName(
      jobBlock,
      "Prepare Wrangler config (production D1 ID)",
    );
    const migrateIdx = stepIndexByName(jobBlock, "Apply production D1 migrations");
    const putIdx = stepIndexByName(jobBlock, "Put production Worker auth secrets");
    const deployIdx = stepIndexByName(jobBlock, "Deploy to Cloudflare Workers");
    expect(validateIdx).toBeLessThan(prepareIdx);
    expect(prepareIdx).toBeLessThan(migrateIdx);
    expect(migrateIdx).toBeLessThan(putIdx);
    expect(putIdx).toBeLessThan(deployIdx);
  });

  it("does not reference production D1 secrets outside the production deploy job file", () => {
    for (const file of [
      "bootstrap.yml",
      "dependabot-automerge.yml",
      "media-test.yml",
    ]) {
      const text = readFileSync(join(REPO_ROOT, ".github/workflows", file), "utf8");
      expect(text).not.toContain("PHYSIO_D1_DATABASE_ID");
      expect(text).not.toContain("d1 migrations apply");
      expect(text).not.toContain("--remote");
    }
  });
});

describe("Worker entry SQL adapter wiring (DIDI-1031)", () => {
  it("passes env.PHYSIO_DB into D1SqlStorage from createWorkerAppDependencies", () => {
    const source = readFileSync(CREATE_DEPS_PATH, "utf8");
    expect(source).toContain("PHYSIO_DB?: PhysioD1Database");
    expect(source).toMatch(/new D1SqlStorage\(env\.PHYSIO_DB\)/);
    expect(source).not.toContain("InMemorySqlStorage");
  });

  it("constructs D1SqlStorage for Worker deps without requiring SQL on auth-only paths", () => {
    const deps = createWorkerAppDependencies({});
    expect(deps.sql).toBeInstanceOf(D1SqlStorage);
  });
});
