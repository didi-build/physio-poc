#!/usr/bin/env node
import { execSync, spawnSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const REPO = "/agent/repos/physio-poc";
const HEAD = execSync("git -C " + REPO + " rev-parse HEAD", {
  encoding: "utf8",
}).trim();
const OUT_MD = `/tmp/didi-1212-mutants-${HEAD}.md`;
const OUT_LOG = `/tmp/didi-1212-baseline-${HEAD}.log`;

const mutants = [
  {
    id: "M1",
    name: "create-worker-production-app-dependencies.ts: extraRouteHandlers cleared (route not registered on Worker)",
    file: "src/adapters/workers/create-worker-production-app-dependencies.ts",
    apply: (s) =>
      s.replace(
        "extraRouteHandlers: [handleExerciseMediaRequest],",
        "extraRouteHandlers: [],",
      ),
  },
  {
    id: "M2",
    name: "require-practitioner.ts: session guard returns bypass token instead of 401",
    file: "src/http/require-practitioner.ts",
    apply: (s) =>
      s.replace("return jsonUnauthorized();", 'return "mutant-session-bypass";'),
  },
  {
    id: "S01",
    name: "create-worker-production-app-dependencies.ts: extraSessionPublicPath opens quota GET without session",
    file: "src/adapters/workers/create-worker-production-app-dependencies.ts",
    apply: (s) =>
      s.replace(
        "exerciseMediaImages: createWorkerImageGenerationPort(env),\n  };",
        `exerciseMediaImages: createWorkerImageGenerationPort(env),
    extraSessionPublicPath: (pathname) => pathname === "/api/me/media-regeneration-quota",
  };`,
      ),
  },
  {
    id: "S02",
    name: "create-worker-production-app-dependencies.ts: extraSessionPublicPath opens all exercise media routes without session",
    file: "src/adapters/workers/create-worker-production-app-dependencies.ts",
    apply: (s) =>
      s.replace(
        "exerciseMediaImages: createWorkerImageGenerationPort(env),\n  };",
        `exerciseMediaImages: createWorkerImageGenerationPort(env),
    extraSessionPublicPath: (pathname) =>
      pathname === "/api/me/media-regeneration-quota" ||
      (pathname.startsWith("/api/me/exercise-versions/") &&
        (pathname.endsWith("/media/generate") ||
          pathname.endsWith("/media/regenerate") ||
          pathname.includes("/media?"))),
  };`,
      ),
  },
  {
    id: "M3",
    name: "exercise-media-service.ts: owner check removed (exercise_created_by !== practitionerId)",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        "if (!version || version.exercise_created_by !== practitionerId)",
        "if (!version)",
      ),
  },
  {
    id: "M4",
    name: "create-image-generation-port.ts: fake chosen when PHYSIO_DEEPINFRA_API_KEY present (if (!apiKey))",
    file: "src/adapters/node/create-image-generation-port.ts",
    apply: (s) => s.replace("if (apiKey) {", "if (!apiKey) {"),
  },
  {
    id: "M5",
    name: "create-image-generation-port.ts: DeepInfra chosen when key absent (if (true))",
    file: "src/adapters/node/create-image-generation-port.ts",
    apply: (s) => s.replace("if (apiKey) {", "if (true) {"),
  },
  {
    id: "M6",
    name: "create-worker-production-app-dependencies.ts: InMemoryObjectStorage kept in prod",
    file: "src/adapters/workers/create-worker-production-app-dependencies.ts",
    apply: (s) =>
      s
        .replace(
          'import { R2ObjectStorage } from "./r2-object-storage.js";',
          'import { InMemoryObjectStorage } from "../../storage/adapters/memory/in-memory-object-storage.js";\nimport { R2ObjectStorage } from "./r2-object-storage.js";',
        )
        .replace(
          "return new R2ObjectStorage(env.PHYSIO_MEDIA);",
          "return new InMemoryObjectStorage();",
        ),
  },
  {
    id: "M7",
    name: ".github/workflows/ci.yml: PHYSIO_DEEPINFRA_API_KEY on PR CI check job",
    file: ".github/workflows/ci.yml",
    apply: (s) =>
      s.includes("PHYSIO_DEEPINFRA_API_KEY")
        ? s
        : s.replace(
            "    name: check\n    runs-on: ubuntu-latest",
            "    name: check\n    env:\n      PHYSIO_DEEPINFRA_API_KEY: ${{ secrets.PHYSIO_DEEPINFRA_API_KEY }}\n    runs-on: ubuntu-latest",
          ),
  },
  {
    id: "M8",
    name: ".github/workflows/deploy-physio-mcp-worker.yml: PHYSIO_DEEPINFRA_API_KEY removed from gated Put step",
    file: ".github/workflows/deploy-physio-mcp-worker.yml",
    apply: (s) =>
      s.replace(
        /          PHYSIO_DEEPINFRA_API_KEY: \$\{\{ secrets\.PHYSIO_DEEPINFRA_API_KEY \}\}\n/,
        "",
      ),
  },
  {
    id: "M9",
    name: "exercise-media.ts: key leaked into ImageGenerationError JSON response",
    file: "src/http/routes/exercise-media.ts",
    apply: (s) =>
      s.replace(
        "return Response.json({ error: error.code }, { status: 502, headers: JSON_HEADERS });",
        "return Response.json({ error: error.code, debug: process.env.PHYSIO_DEEPINFRA_API_KEY }, { status: 502, headers: JSON_HEADERS });",
      ),
  },
  {
    id: "L02",
    name: "exercise-media.ts: 502 ImageGenerationError body includes upstream message",
    file: "src/http/routes/exercise-media.ts",
    apply: (s) =>
      s.replace(
        "return Response.json({ error: error.code }, { status: 502, headers: JSON_HEADERS });",
        "return Response.json({ error: error.code, message: error.message }, { status: 502, headers: JSON_HEADERS });",
      ),
  },
  {
    id: "L03",
    name: "deepinfra-flux-klein-image-generation.ts: apiKey logged on HTTP request failure",
    file: "src/adapters/node/deepinfra-flux-klein-image-generation.ts",
    apply: (s) =>
      s.replaceAll(
        "requestFailed(response.status);",
        'console.error("deepinfra_request_failed", this.config.apiKey); requestFailed(response.status);',
      ),
  },
  {
    id: "K09",
    name: "deploy-physio-mcp-worker.yml: deploy job environment not production",
    file: ".github/workflows/deploy-physio-mcp-worker.yml",
    apply: (s) => s.replace("environment: production", "environment: staging"),
  },
  {
    id: "K11",
    name: "deploy-physio-mcp-worker.yml: PHYSIO_DEEPINFRA_API_KEY on non-Put step",
    file: ".github/workflows/deploy-physio-mcp-worker.yml",
    apply: (s) => {
      if (s.includes("name: Checkout\n") && !s.includes("MUTANT_K11")) {
        return s.replace(
          "name: Checkout\n",
          "name: Checkout\n        env:\n          PHYSIO_DEEPINFRA_API_KEY: ${{ secrets.PHYSIO_DEEPINFRA_API_KEY }}\n",
        );
      }
      return s;
    },
  },
  {
    id: "M11",
    name: "exercise-media.ts: no-store removed from SERVE_JSON_HEADERS",
    file: "src/http/routes/exercise-media.ts",
    apply: (s) =>
      s.replace(
        '"cache-control": "no-store"',
        '"cache-control": "public, max-age=3600"',
      ),
  },
  {
    id: "B1D",
    name: "deepinfra-flux-klein-image-generation.ts: restore ?? fetch (unbound)",
    file: "src/adapters/node/deepinfra-flux-klein-image-generation.ts",
    apply: (s) =>
      s.replace(
        "this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));",
        "this.fetchImpl = config.fetchImpl ?? fetch;",
      ),
  },
  {
    id: "B1F",
    name: "fal-flux-klein-image-generation.ts: restore ?? fetch (unbound)",
    file: "src/adapters/node/fal-flux-klein-image-generation.ts",
    apply: (s) =>
      s.replace(
        "this.fetchImpl = config.fetchImpl ?? ((input, init) => fetch(input, init));",
        "this.fetchImpl = config.fetchImpl ?? fetch;",
      ),
  },
  {
    id: "Q1A",
    name: "exercise-media.ts: wrong 409 error code string",
    file: "src/http/routes/exercise-media.ts",
    apply: (s) =>
      s.replace(
        '{ error: "exercise_media_already_generated" }',
        '{ error: "media_already_exists" }',
      ),
  },
  {
    id: "Q1B",
    name: "exercise-media.ts: 409 → 400 for already generated",
    file: "src/http/routes/exercise-media.ts",
    apply: (s) =>
      s.replace(
        'error.code === "exercise_media_already_generated") {\n    return Response.json(\n      { error: "exercise_media_already_generated" },\n      { status: 409,',
        'error.code === "exercise_media_already_generated") {\n    return Response.json(\n      { error: "exercise_media_already_generated" },\n      { status: 400,',
      ),
  },
  {
    id: "Q1C",
    name: "exercise-media-service.ts: generate skips cap increment",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        /    const nowIso = this\.clock\(\)\.toISOString\(\);\n    await this\.regenerations\.insert\(\{[\s\S]*?createdAt: nowIso,\n    \}\);\n    return media;/,
        "    return media;",
      ),
  },
  {
    id: "Q2A",
    name: "bounded-json-request-body.ts: remove Content-Length precheck",
    file: "src/http/bounded-json-request-body.ts",
    apply: (s) =>
      s.replace(
        /  const contentLength = contentLengthHeader\(request\);\n  if \(contentLength !== null && contentLength > maxBytes\) \{\n    return EXERCISE_MEDIA_REQUEST_BODY_TOO_LARGE;\n  \}\n\n/,
        "",
      ),
  },
  {
    id: "Q2B",
    name: "bounded-json-request-body.ts: reject at cap (>=)",
    file: "src/http/bounded-json-request-body.ts",
    apply: (s) => s.replace("contentLength > maxBytes", "contentLength >= maxBytes"),
  },
  {
    id: "Q2C",
    name: "bounded-json-request-body.ts: skip bounded read (arrayBuffer)",
    file: "src/http/bounded-json-request-body.ts",
    apply: (s) =>
      s.replace(
        "    bytes = await readBodyBytesBounded(request, maxBytes);",
        "    bytes = new Uint8Array(await request.arrayBuffer());",
      ),
  },
  {
    id: "P1",
    name: "persistApprovedPendingMediaSet writes public object visibility (approved generate/regenerate)",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        /await this\.media\.putImage\(\s*keys\.startObjectKey,\s*input\.start\.bytes,\s*input\.start\.contentType,\s*"draft",/,
        `await this.media.putImage(
      keys.startObjectKey,
      input.start.bytes,
      input.start.contentType,
      "public",`,
      ),
  },
  {
    id: "P2",
    name: "persistApprovedPendingMediaSet inserts public exercise_media_sets row",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        'visibility: "draft",\n      createdAt,\n    });\n    await this.versions.updatePendingDraft',
        'visibility: "public",\n      createdAt,\n    });\n    await this.versions.updatePendingDraft',
      ),
  },
  {
    id: "P3",
    name: "getMediaForServing internal serves pending_media_set_id without owner gate",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        `if (sessionPractitionerId !== version.pending_media_requested_by) {
          throw this.versionNotFoundError();
        }`,
        "/* pending requester gate removed */",
      ),
  },
  {
    id: "P4",
    name: "exercise-media serve JSON drops Cache-Control no-store",
    file: "src/http/routes/exercise-media.ts",
    apply: (s) =>
      s.replace(
        'const SERVE_JSON_HEADERS = {\n  ...JSON_HEADERS,\n  "cache-control": "no-store",\n};',
        "const SERVE_JSON_HEADERS = { ...JSON_HEADERS };",
      ),
  },
  {
    id: "C6R1",
    name: "exercise-media-service.ts: pending internal serve skips requester match",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        "sessionPractitionerId !== version.pending_media_requested_by",
        "false && sessionPractitionerId !== version.pending_media_requested_by",
      ),
  },
  {
    id: "C6R2",
    name: "exercise-media-service.ts: approved regenerate skips pending requester gate",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(`version.pending_media_requested_by !== input.practitionerId`, "false"),
  },
  {
    id: "C6R3",
    name: "exercise-media-service.ts: replace pending without deleting old draft objects",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        /    if \(input\.version\.pending_media_set_id\) \{[\s\S]*?    \}\n    const mediaSetId = this\.createId\(\);/,
        "    const mediaSetId = this.createId();",
      ),
  },
  {
    id: "C6R4",
    name: "exercise-media-service.ts: public serve prefers pending_media_set_id",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        "if (!version.media_set_id) {\n        return null;\n      }\n      const row = await this.mediaSets.findById(version.media_set_id);",
        `const publicSetId = version.pending_media_set_id ?? version.media_set_id;
      if (!publicSetId) {
        return null;
      }
      const row = await this.mediaSets.findById(publicSetId);`,
      ),
  },
  {
    id: "C6R5",
    name: "exercise-media-service.ts: generate allowed when pending already exists",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        /    if \(version\.pending_media_set_id\) \{[\s\S]*?    \}\n    const promptContext/,
        "    const promptContext",
      ),
  },
  {
    id: "C6R6",
    name: "exercise-media-service.ts: approved pending persist also updates live media_set_id",
    file: "src/services/exercise-media/exercise-media-service.ts",
    apply: (s) =>
      s.replace(
        "await this.versions.updatePendingDraft(input.version.id, {",
        "await this.versions.updateMediaSetId(input.version.id, mediaSetId);\n    await this.versions.updatePendingDraft(input.version.id, {",
      ),
  },
];

function runSuite() {
  const r = spawnSync("npm", ["run", "test", "--", "--maxWorkers=1"], {
    cwd: REPO,
    encoding: "utf8",
    shell: false,
    maxBuffer: 64 * 1024 * 1024,
  });
  const out = `${r.stdout}\n${r.stderr}`;
  return { code: r.status ?? 1, out };
}

function parseSummary(out) {
  const testsLine = [...out.matchAll(/^\s*Tests\s+(.+)$/gm)].pop()?.[1]?.trim() ?? "?";
  const filesLine =
    [...out.matchAll(/^\s*Test Files\s+(.+)$/gm)].pop()?.[1]?.trim() ?? "?";
  let failed = 0;
  let passed = 0;
  let skipped = 0;
  const failMatch = testsLine.match(/(\d+)\s+failed/);
  const passMatch = testsLine.match(/(\d+)\s+passed/);
  const skipMatch = testsLine.match(/(\d+)\s+skipped/);
  if (failMatch) failed = Number(failMatch[1]);
  if (passMatch) passed = Number(passMatch[1]);
  if (skipMatch) skipped = Number(skipMatch[1]);
  return { testsLine, filesLine, failed, passed, skipped };
}

function parseKillingTests(out) {
  const names = new Set();
  for (const line of out.split("\n")) {
    const fail = line.match(/^\s*FAIL\s{2}(.+)$/);
    if (fail) {
      names.add(fail[1].trim());
      continue;
    }
    const fail2 = line.match(/^\s*❯\s+(.+\.test\.tsx?)\s+>\s+(.+)$/);
    if (fail2) {
      names.add(`${fail2[1]} > ${fail2[2].trim()}`);
    }
  }
  return [...names].sort();
}

function classifyMutant(row, baseline) {
  if (row.status.startsWith("Survived")) {
    return row.status.includes("no-op") ? "no-op" : "survivor";
  }
  if (row.code !== 0 && row.summary.failed > baseline.failed) {
    return "test_failure";
  }
  if (row.code !== 0 && row.summary.failed === baseline.failed) {
    return "infra_error";
  }
  return "equivalent";
}

function runBaseline() {
  console.error("Running baseline suite...");
  const { code, out } = runSuite();
  writeFileSync(OUT_LOG, out + `\nBASELINE_EXIT=${code}\n`);
  const summary = parseSummary(out);
  if (code !== 0) {
    throw new Error(`Baseline failed exit ${code}`);
  }
  return summary;
}

const baseline = runBaseline();

const rows = [];

for (const m of mutants) {
  const path = `${REPO}/${m.file}`;
  const original = readFileSync(path, "utf8");
  const mutated = m.apply(original);
  if (mutated === original) {
    rows.push({
      ...m,
      diff: "(empty — mutant no-op)",
      code: 0,
      summary: parseSummary(""),
      kills: [],
      status: "Survived (no-op)",
    });
    continue;
  }
  writeFileSync(path, mutated, "utf8");
  const diff = execSync(`git -C ${REPO} diff -- ${m.file}`, { encoding: "utf8" });
  console.error(`Running mutant ${m.id}...`);
  const { code, out } = runSuite();
  execSync(`git -C ${REPO} checkout -- ${m.file}`);
  const clean = spawnSync("git", ["-C", REPO, "diff", "--quiet"]);
  if (clean.status !== 0) {
    execSync(`git -C ${REPO} checkout -- .`);
  }
  const summary = parseSummary(out);
  const kills = parseKillingTests(out);
  rows.push({
    ...m,
    diff,
    code,
    summary,
    kills,
    status: kills.length > 0 ? "Killed" : "Survived",
  });
}

let md = `# DIDI-1212 mutant evidence\n\nHead: \`${HEAD}\`\n\n`;
md += `Baseline (serial \`npm run test -- --maxWorkers=1\`): **Test Files** ${baseline.filesLine}; **Tests** ${baseline.testsLine}; exit **0**.\n\n`;
md += `| ID | Mutant site | Exit | Failed | Passed | Skipped | vs baseline (failed/passed) | Error kind | Status |\n`;
md += `|----|-------------|------|--------|--------|---------|-----------------------------|------------|--------|\n`;
for (const r of rows) {
  const kind = classifyMutant(r, baseline);
  md += `| ${r.id} | ${r.name} | ${r.code} | ${r.summary.failed} | ${r.summary.passed} | ${r.summary.skipped} | ${baseline.failed} / ${baseline.passed} → ${r.summary.failed} / ${r.summary.passed} | ${kind} | ${r.status} |\n`;
}
md += `\n## Killing tests (full vitest names)\n\n`;
for (const r of rows) {
  md += `### ${r.id}\n\n`;
  if (r.kills.length === 0) {
    md += "(none)\n\n";
  } else {
    for (const name of r.kills) {
      md += `- ${name}\n`;
    }
    md += "\n";
  }
}
md += `## Diffs\n\n`;
for (const r of rows) {
  md += `### ${r.id}: ${r.name}\n\n\`\`\`diff\n${r.diff.trim() || "(no diff)"}\n\`\`\`\n\n`;
}

const survivors = rows.filter((r) => r.status.startsWith("Survived")).length;
md += `Survivors: **${survivors}** / ${rows.length}\n`;

writeFileSync(OUT_MD, md);
console.log(`Wrote ${OUT_MD} survivors=${survivors}`);
console.log(md.slice(0, 4000));
