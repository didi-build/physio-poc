import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import { FakeAuthPort } from "../src/auth/fake-auth-port.js";
import { handleRequest, MCP_PATH } from "../src/http/app.js";
import worker from "../src/entry/worker.js";
import {
  createStubWorkerAssetsBinding,
  WORKER_UI_SHELL_MARKER,
  WORKER_UI_STUB_ASSET_PATH,
} from "./helpers/worker-assets-stub.js";
import {
  buildWorkerProductionAuthEnv,
  createWorkerProductionAuthTestDeps,
  WORKER_PRODUCTION_TEST_BASE,
} from "./helpers/worker-production-auth-test-utils.js";
import { openWorkerAuthTestDatabase } from "./helpers/worker-auth-d1-fixture.js";
import { resetWorkerProductionAuthCacheForTests } from "../src/adapters/workers/create-app-dependencies.js";
import { testOpaqueEntityId } from "./helpers/opaque-test-ids.js";

const WORKER_BASE = WORKER_PRODUCTION_TEST_BASE;

describe("Worker production UI static (DIDI-1169)", () => {
  async function productionEnvWithAssets() {
    resetWorkerProductionAuthCacheForTests();
    const { d1 } = await openWorkerAuthTestDatabase();
    return buildWorkerProductionAuthEnv({
      PHYSIO_DB: d1,
      ASSETS: createStubWorkerAssetsBinding(),
    });
  }

  it("GET /sign-in returns 200 text/html SPA shell when ASSETS is wired", async () => {
    const env = await productionEnvWithAssets();
    const response = await worker.fetch(new Request(`${WORKER_BASE}/sign-in`), env);
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("text/html");
    const html = await response.text();
    expect(html).toContain(WORKER_UI_SHELL_MARKER);
  });

  it("unauthenticated GET / redirects to /sign-in?returnTo=%2F", async () => {
    const env = await productionEnvWithAssets();
    const response = await worker.fetch(new Request(`${WORKER_BASE}/`), env);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/sign-in?returnTo=%2F");
  });

  it("GET /assets/<hashed file> returns the asset from ASSETS", async () => {
    const env = await productionEnvWithAssets();
    const response = await worker.fetch(
      new Request(`${WORKER_BASE}${WORKER_UI_STUB_ASSET_PATH}`),
      env,
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toContain("javascript");
    await expect(response.text()).resolves.toBe("console.log('stub-asset');");
  });

  it("GET /api/unknown still returns JSON not_found", async () => {
    const { deps } = await createWorkerProductionAuthTestDeps({
      ASSETS: createStubWorkerAssetsBinding(),
    });
    const practitionerId = testOpaqueEntityId("worker-ui-api-unknown");
    const sessionDeps = {
      ...deps,
      auth: new FakeAuthPort({
        practitioner: {
          practitionerId,
          email: "worker-ui-unknown@example.com",
          displayName: "Worker UI",
        },
      }),
    };
    const response = await handleRequest(
      new Request(`${WORKER_BASE}/api/unknown`, {
        headers: { cookie: "physio.fake_session=1" },
      }),
      sessionDeps,
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("content-type")).toContain("application/json");
    await expect(response.json()).resolves.toEqual({ error: "not_found" });
  });

  it("GET /health still returns ok JSON", async () => {
    const env = await productionEnvWithAssets();
    const response = await worker.fetch(new Request(`${WORKER_BASE}/health`), env);
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      service: "physio-poc",
    });
  });

  it("GET /mcp without session still returns 401 bearer challenge", async () => {
    const env = await productionEnvWithAssets();
    const response = await worker.fetch(new Request(`${WORKER_BASE}${MCP_PATH}`), env);
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")?.toLowerCase()).toContain("bearer");
  });
});

const REPO_ROOT = join(import.meta.dirname, "..");
const WRANGLER_PATH = join(REPO_ROOT, "wrangler.jsonc");
const DEPLOY_WORKFLOW_PATH = join(
  REPO_ROOT,
  ".github/workflows/deploy-physio-mcp-worker.yml",
);

const BUILD_UI_STEP = "Build UI static assets";
const DEPLOY_STEP = "Deploy to Cloudflare Workers";

function loadDeploySteps(): { name?: string; run?: string }[] {
  const doc = yaml.load(readFileSync(DEPLOY_WORKFLOW_PATH, "utf8")) as {
    jobs: { deploy: { steps: { name?: string; run?: string }[] } };
  };
  return doc.jobs.deploy.steps;
}

describe("Worker wrangler and deploy UI config (DIDI-1169)", () => {
  it("pins assets.directory ./dist/ui and run_worker_first true in wrangler.jsonc", () => {
    const text = readFileSync(WRANGLER_PATH, "utf8");
    expect(text).toContain('"directory": "./dist/ui"');
    expect(text).toContain('"binding": "ASSETS"');
    expect(text).toMatch(/"run_worker_first":\s*true/);
  });

  it("runs npm run build:ui before wrangler deploy in the deploy workflow", () => {
    const steps = loadDeploySteps();
    const buildIdx = steps.findIndex((step) => step.name === BUILD_UI_STEP);
    const deployIdx = steps.findIndex((step) => step.name === DEPLOY_STEP);
    expect(buildIdx).toBeGreaterThan(-1);
    expect(deployIdx).toBeGreaterThan(buildIdx);
    expect(steps[buildIdx]?.run?.trim()).toBe("npm run build:ui");
  });
});
