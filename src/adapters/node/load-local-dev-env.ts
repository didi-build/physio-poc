import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

function applyEnvFile(path: string): void {
  if (!existsSync(path)) {
    return;
  }
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (trimmed.length === 0 || trimmed.startsWith("#")) {
      continue;
    }
    const eq = trimmed.indexOf("=");
    if (eq <= 0) {
      continue;
    }
    const key = trimmed.slice(0, eq).trim();
    if (key.length === 0 || process.env[key] !== undefined) {
      continue;
    }
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    process.env[key] = value;
  }
}

/** Loads `.dev.vars` then `.env` for local Node dev (gitignored; never commit secrets). */
export function loadLocalDevEnv(cwd = process.cwd()): void {
  applyEnvFile(join(cwd, ".dev.vars"));
  applyEnvFile(join(cwd, ".env"));
}
