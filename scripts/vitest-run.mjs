import { spawnSync } from "node:child_process";

const extra = process.argv.slice(2);
const result = spawnSync("npx", ["vitest", "run", ...extra], {
  encoding: "utf8",
  env: process.env,
  maxBuffer: 64 * 1024 * 1024,
});

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}

const combined = `${result.stdout ?? ""}${result.stderr ?? ""}`;
const filesFailed = /Test Files\s+[^\n]*?(\d+)\s+failed/.exec(combined);
const testsFailed = /Tests\s+[^\n]*?(\d+)\s+failed/.exec(combined);
const failedCount = Math.max(
  filesFailed ? Number(filesFailed[1]) : 0,
  testsFailed ? Number(testsFailed[1]) : 0,
);

if (failedCount > 0) {
  process.exit(1);
}

if (result.error) {
  process.exit(1);
}

process.exit(typeof result.status === "number" ? result.status : 1);
