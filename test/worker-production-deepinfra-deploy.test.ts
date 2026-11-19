import { readFileSync } from "node:fs";
import { join } from "node:path";
import yaml from "js-yaml";
import { describe, expect, it } from "vitest";
import {
  PRODUCTION_WORKER_OPTIONAL_SECRET_NAMES,
  buildWorkerAuthSecretsPayload,
} from "../scripts/lib/production-worker-auth-secrets.mjs";
import {
  DEPLOY_WORKFLOW_FILENAME,
  nonDeployWorkflowFilenames,
} from "./helpers/production-deploy-workflow-guards.js";

const REPO_ROOT = join(import.meta.dirname, "..");
const WORKFLOWS_DIR = join(REPO_ROOT, ".github/workflows");
const DEPLOY_WORKFLOW_PATH = join(WORKFLOWS_DIR, DEPLOY_WORKFLOW_FILENAME);

const DEEPINFRA_SECRET_NAME = "PHYSIO_DEEPINFRA_API_KEY";
const PUT_STEP_NAME = "Put production Worker auth secrets";

type WorkflowStep = {
  name?: string;
  env?: Record<string, string>;
  run?: string;
};

type DeployWorkflow = {
  jobs: {
    deploy: {
      steps: WorkflowStep[];
    };
  };
};

function loadDeployWorkflow(): DeployWorkflow {
  return yaml.load(readFileSync(DEPLOY_WORKFLOW_PATH, "utf8")) as DeployWorkflow;
}

describe("PHYSIO_DEEPINFRA_API_KEY production deploy wiring (DIDI-1212)", () => {
  it("pins the optional DeepInfra secret name list", () => {
    expect([...PRODUCTION_WORKER_OPTIONAL_SECRET_NAMES]).toEqual([
      DEEPINFRA_SECRET_NAME,
    ]);
  });

  it("omits PHYSIO_DEEPINFRA_API_KEY from bulk upload when unset", () => {
    const payload = buildWorkerAuthSecretsPayload({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "sec",
      BETTER_AUTH_SECRET: "fixture-better-auth-secret-at-least-32-chars",
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "coach@example.com",
    });
    expect(Object.keys(payload)).not.toContain(DEEPINFRA_SECRET_NAME);
  });

  it("includes PHYSIO_DEEPINFRA_API_KEY in bulk upload when set", () => {
    const fixtureKey = "fixture-non-live-deepinfra-key";
    const payload = buildWorkerAuthSecretsPayload({
      GOOGLE_CLIENT_ID: "id",
      GOOGLE_CLIENT_SECRET: "sec",
      BETTER_AUTH_SECRET: "fixture-better-auth-secret-at-least-32-chars",
      PHYSIO_ALLOWED_GOOGLE_EMAILS: "coach@example.com",
      PHYSIO_DEEPINFRA_API_KEY: `  ${fixtureKey}  `,
    });
    expect(payload.PHYSIO_DEEPINFRA_API_KEY).toBe(fixtureKey);
  });

  it("passes PHYSIO_DEEPINFRA_API_KEY only on the gated deploy Put step", () => {
    const steps = loadDeployWorkflow().jobs.deploy.steps;
    const putStep = steps.find((step) => step.name === PUT_STEP_NAME);
    expect(putStep?.env?.[DEEPINFRA_SECRET_NAME]).toBe(
      `\${{ secrets.${DEEPINFRA_SECRET_NAME} }}`,
    );
    for (const step of steps) {
      if (step.name === PUT_STEP_NAME) {
        continue;
      }
      expect(step.env?.[DEEPINFRA_SECRET_NAME]).toBeUndefined();
    }
  });

  it("keeps PHYSIO_DEEPINFRA_API_KEY out of non-deploy workflow files", () => {
    for (const name of nonDeployWorkflowFilenames(WORKFLOWS_DIR)) {
      const text = readFileSync(join(WORKFLOWS_DIR, name), "utf8");
      expect(text, name).not.toContain(DEEPINFRA_SECRET_NAME);
    }
    const deployNames = nonDeployWorkflowFilenames(WORKFLOWS_DIR);
    expect(deployNames).not.toContain(DEPLOY_WORKFLOW_FILENAME);
  });
});
