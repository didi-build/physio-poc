import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";

const WORKFLOWS_DIR =
  process.env.VERIFY_ACTION_PINS_WORKFLOWS_DIR ?? join(".github", "workflows");
const PIN_RE = /uses:\s+([^@\s]+)@([0-9a-f]{40})\s+#\s*(v[^\s]+)/gi;
const USES_LINE_RE = /^\s*-\s+uses:\s+(\S+)/;
const FULL_SHA_REF_RE = /^[0-9a-f]{40}$/i;

function listWorkflowFiles(dir) {
  return readdirSync(dir).filter(
    (name) => name.endsWith(".yml") || name.endsWith(".yaml"),
  );
}

function collectUnpinnedUses() {
  const problems = [];
  for (const file of listWorkflowFiles(WORKFLOWS_DIR)) {
    const text = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    for (const line of text.split("\n")) {
      const match = line.match(USES_LINE_RE);
      if (!match) continue;
      const spec = match[1];
      const at = spec.lastIndexOf("@");
      if (at === -1) {
        problems.push({ file, spec, reason: "missing @ ref" });
        continue;
      }
      const ref = spec.slice(at + 1);
      if (!FULL_SHA_REF_RE.test(ref)) {
        problems.push({ file, spec, reason: "ref is not a 40-character commit SHA" });
      }
    }
  }
  return problems;
}

function ghApi(path) {
  const out = execFileSync("gh", ["api", path], {
    encoding: "utf8",
    env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN },
  });
  return JSON.parse(out);
}

/** @returns {string} commit SHA the tag resolves to */
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
    env: { ...process.env, GH_TOKEN: process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN },
  });
  if (result.status !== 0) return false;
  const data = JSON.parse(result.stdout);
  return data.sha === sha;
}

function collectPins() {
  const pins = [];
  for (const file of listWorkflowFiles(WORKFLOWS_DIR)) {
    const text = readFileSync(join(WORKFLOWS_DIR, file), "utf8");
    for (const match of text.matchAll(PIN_RE)) {
      pins.push({
        file,
        repo: match[1],
        pin: match[2],
        tag: match[3],
      });
    }
  }
  return pins;
}

const unpinned = collectUnpinnedUses();
if (unpinned.length > 0) {
  for (const { file, spec, reason } of unpinned) {
    console.error(`FAIL  ${file}  ${spec}  (${reason})`);
  }
  process.exit(1);
}

const token = process.env.GH_TOKEN ?? process.env.GITHUB_TOKEN;
if (!token) {
  console.log(
    "OK  all workflow uses: refs are 40-character SHAs (skipped tag verification, no token)",
  );
  process.exit(0);
}

const pins = collectPins();
if (pins.length === 0) {
  console.error("No pinned actions with version comments found in workflow files.");
  process.exit(1);
}

let failed = false;
for (const { file, repo, pin, tag } of pins) {
  if (pin.length !== 40) {
    failed = true;
    console.log(
      `FAIL  ${file}  ${repo}@${tag}  pin=${pin}  resolved=(invalid pin length ${pin.length})`,
    );
    continue;
  }
  const resolved = resolveTagToCommit(repo, tag);
  const tagOk = resolved === pin;
  const commitOk = commitExists(repo, pin);
  const ok = tagOk && commitOk;
  if (!ok) failed = true;
  const commitNote = commitOk ? "commit=OK" : "commit=MISSING";
  console.log(
    `${ok ? "OK" : "FAIL"}  ${file}  ${repo}@${tag}  pin=${pin}  resolved=${resolved}  ${commitNote}`,
  );
}

process.exit(failed ? 1 : 0);
