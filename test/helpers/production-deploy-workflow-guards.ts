import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

export const DEPLOY_WORKFLOW_FILENAME = "deploy-physio-mcp-worker.yml";

const D1_DERIVED_VALUE_IN_PRINT = /\$\{?(PHYSIO_D1_DATABASE_ID|TRIMMED)\}?/;

export function nonDeployWorkflowFilenames(workflowsDir: string): string[] {
  return readdirSync(workflowsDir)
    .filter(
      (name) =>
        (name.endsWith(".yml") || name.endsWith(".yaml")) &&
        name !== DEPLOY_WORKFLOW_FILENAME,
    )
    .sort();
}

export function workflowReferencesProductionD1(text: string): boolean {
  return (
    text.includes("PHYSIO_D1_DATABASE_ID") ||
    text.includes("d1 migrations apply") ||
    text.includes("--remote")
  );
}

export function workflowFilesReferencingProductionD1(
  workflowsDir: string,
  readText: (path: string) => string = (path) => readFileSync(path, "utf8"),
): string[] {
  return nonDeployWorkflowFilenames(workflowsDir).filter((file) => {
    const text = readText(join(workflowsDir, file));
    return workflowReferencesProductionD1(text);
  });
}

export function deployJobBlock(workflowText: string): string {
  const jobsIndex = workflowText.indexOf("jobs:");
  if (jobsIndex === -1) {
    throw new Error("deploy workflow missing jobs:");
  }
  return workflowText.slice(jobsIndex);
}

export function deployJobSteps(workflowText: string): { name: string; text: string }[] {
  const jobBlock = deployJobBlock(workflowText);
  const stepsIndex = jobBlock.indexOf("\n    steps:");
  if (stepsIndex === -1) {
    throw new Error("deploy job missing steps:");
  }
  const stepsSection = jobBlock.slice(stepsIndex + "\n    steps:".length);
  const chunks = stepsSection.split(/\n {6}- /).filter(Boolean);
  return chunks.map((chunk, index) => {
    const nameMatch = chunk.match(/^name: (.+)$/m);
    if (nameMatch) {
      return { name: nameMatch[1]!.trim(), text: chunk };
    }
    const usesMatch = chunk.match(/^uses: (.+)$/m);
    return {
      name: usesMatch ? `uses ${usesMatch[1]!.trim()}` : `step-${index + 1}`,
      text: chunk,
    };
  });
}

export function violationsInDeployJobStepText(text: string): string[] {
  const violations: string[] = [];
  if (/\bcat\b[^\n]*wrangler\.ci\.jsonc/.test(text)) {
    violations.push("cat-wrangler-config");
  }
  if (/\bset\s+-x\b/.test(text) || /\bset\s+-o\s+xtrace\b/.test(text)) {
    violations.push("set-x");
  }
  for (const line of text.split("\n")) {
    if (
      (/\becho\b/.test(line) || /\bprintf\b/.test(line)) &&
      D1_DERIVED_VALUE_IN_PRINT.test(line) &&
      !/::add-mask::/.test(line)
    ) {
      violations.push("print-derived-d1-id");
      break;
    }
  }
  if (/\bupload-artifact\b/.test(text)) {
    violations.push("upload-artifact");
  }
  if (/ACTIONS_STEP_DEBUG/.test(text)) {
    violations.push("actions-step-debug");
  }
  return violations;
}

export function violationsInDeployWorkflow(workflowText: string): string[] {
  const violations: string[] = [];
  for (const step of deployJobSteps(workflowText)) {
    for (const code of violationsInDeployJobStepText(step.text)) {
      violations.push(`${step.name}:${code}`);
    }
  }
  return violations;
}

export function stepBodiesAfterName(workflowText: string, stepName: string): string[] {
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

export function normalizePrepareStepRunBody(body: string): string {
  return body.replace(/^\n/, "").replace(/\s+$/u, "");
}

export const EXPECTED_PREPARE_WRANGLER_STEP_RUN = [
  "          set -euo pipefail",
  '          case "${PHYSIO_D1_DATABASE_ID}" in',
  "            *$'\\n'*|*$'\\r'*)",
  '              echo "PHYSIO_D1_DATABASE_ID must not contain newline characters." >&2',
  "              exit 1",
  "              ;;",
  "          esac",
  '          TRIMMED="${PHYSIO_D1_DATABASE_ID#"${PHYSIO_D1_DATABASE_ID%%[![:space:]]*}"}"',
  '          TRIMMED="${TRIMMED%"${TRIMMED##*[![:space:]]}"}"',
  '          if [ "${PHYSIO_D1_DATABASE_ID}" != "${TRIMMED}" ]; then',
  '            echo "PHYSIO_D1_DATABASE_ID must not contain leading or trailing whitespace." >&2',
  "            exit 1",
  "          fi",
  '          echo "::add-mask::${TRIMMED}"',
  '          PHYSIO_D1_DATABASE_ID="${TRIMMED}" node scripts/prepare-wrangler-config.mjs --output wrangler.ci.jsonc',
].join("\n");

export function prepareStepYamlBlock(workflowText: string): string {
  const needle = "- name: Prepare Wrangler config (production D1 ID)";
  const idx = workflowText.indexOf(needle);
  if (idx === -1) {
    throw new Error("missing Prepare Wrangler config step");
  }
  const nextStep = workflowText.indexOf("\n      - ", idx + needle.length);
  const end = nextStep === -1 ? workflowText.length : nextStep;
  return workflowText.slice(idx, end);
}
