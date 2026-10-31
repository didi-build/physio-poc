import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import {
  ACTIONS_DIR_ENV,
  REPO_ROOT_ENV,
  WORKFLOWS_DIR_ENV,
  collectAllRemoteShaUses,
  collectUsesProblems,
} from "./lib/github-actions-uses-validation.mjs";

const workflowsDir = process.env[WORKFLOWS_DIR_ENV] ?? join(".github", "workflows");
const actionsDir =
  process.env[ACTIONS_DIR_ENV] === "none"
    ? null
    : (process.env[ACTIONS_DIR_ENV] ?? join(".github", "actions"));
const repoRoot = process.env[REPO_ROOT_ENV] ?? process.cwd();

let scan;
try {
  scan = collectUsesProblems({ workflowsDir, actionsDir, repoRoot });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (scan.problems.length > 0) {
  for (const { file, line, spec, reason } of scan.problems) {
    const where = line ? `${file}:${line}` : file;
    const detail = spec ? `${spec}  ` : "";
    console.error(`FAIL  ${where}  ${detail}(${reason})`);
  }
  process.exit(1);
}

if (scan.totalUses === 0) {
  console.error("No uses: refs found under workflow and action directories.");
  process.exit(1);
}

const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!token) {
  console.log(
    `OK  ${scan.totalUses} uses: refs validated locally (skipped tag verification, no token)`,
  );
  process.exit(0);
}

function ghApi(path) {
  const out = execFileSync("gh", ["api", path], {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: token },
  });
  return JSON.parse(out);
}

function resolveTagToCommit(repo, tag) {
  const ref = ghApi(`repos/${repo}/git/ref/tags/${tag}`);
  const { sha, type } = ref.object;
  if (type === "commit") return sha;
  if (type === "tag") {
    const tagObj = ghApi(`repos/${repo}/git/tags/${sha}`);
    return tagObj.object.sha;
  }
  throw new Error(`${repo}@${tag}: unexpected ref type ${type}`);
}

function commitExists(repo, sha) {
  const result = spawnSync("gh", ["api", `repos/${repo}/commits/${sha}`], {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: token },
  });
  if (result.status !== 0) return false;
  const data = JSON.parse(result.stdout);
  return data.sha === sha;
}

let refs;
try {
  refs = collectAllRemoteShaUses({ workflowsDir, actionsDir });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

if (refs.length === 0) {
  console.error("No remote SHA-pinned uses: refs found for tag verification.");
  process.exit(1);
}

let failed = false;
for (const { file, repo, sha, tag, spec } of refs) {
  const commitOk = commitExists(repo, sha);
  let tagOk = true;
  if (tag) {
    try {
      tagOk = resolveTagToCommit(repo, tag) === sha;
    } catch {
      tagOk = false;
    }
  }
  const ok = commitOk && tagOk;
  if (!ok) failed = true;
  const tagNote = tag ? (tagOk ? "tag=OK" : "tag=MISMATCH") : "tag=(none)";
  const commitNote = commitOk ? "commit=OK" : "commit=MISSING";
  console.log(`${ok ? "OK" : "FAIL"}  ${file}  ${spec}  ${commitNote}  ${tagNote}`);
}

process.exit(failed ? 1 : 0);
