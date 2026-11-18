#!/usr/bin/env node
import { readFileSync } from "node:fs";

const logPath = process.argv[2];
if (!logPath) {
  console.error("Usage: format-didi-1008-mutant-table.mjs <mutant-log>");
  process.exit(1);
}

const text = readFileSync(logPath, "utf8");
const blocks = text.split("=== ").filter(Boolean);

console.log("| Mutant | Description | Result | Failing tests |");
console.log("| -- | -- | -- | -- |");

const descriptions = {
  M1: "Wrong DeepInfra chat completions URL",
  M2: "Broken default model id constant",
  M3: "json_schema strict set to false",
  M4: "System prompt omits no-patient-info constraint",
  M5: "MAX_AI_ATTEMPTS reduced to 1",
  M6: "HTTP 401 retried instead of failing fast",
  M7: "Timeout mapped to network_error not timeout",
  M8: "Response streaming cap raised to 1 MiB",
  M9: "Server-side schema validation disabled",
  M10: "AI draft insert uses approved status",
  M11: "API key redaction disabled",
  M12: "Factory ignores PHYSIO_DEEPINFRA_API_KEY",
};

for (const block of blocks) {
  const id = block.split(" ===")[0].trim();
  if (!/^M\d+$/.test(id)) {
    continue;
  }
  const failLines = block
    .split("\n")
    .filter((line) => line.startsWith(" FAIL "))
    .map((line) => {
      const match = line.match(/test\/[^\s]+\.test\.ts/);
      return match ? match[0] : line.replace(/^ FAIL\s+/, "").trim();
    });
  const vitestExit = block.match(/vitest_exit=(\d+)/)?.[1] ?? "?";
  const result = vitestExit === "0" ? "Survived" : "Killed";
  const fails =
    failLines.length > 0
      ? failLines.join(", ")
      : result === "Survived"
        ? "none"
        : "suite failed";
  const desc = descriptions[id] ?? id;
  console.log(`| ${id} | ${desc} | ${result} | ${fails} |`);
}
