import { tmpdir } from "node:os";

/** Minimal env for spawnSync in tests (avoid leaking CI secrets from process.env). */
export function minimalChildProcessEnv(
  extra: Record<string, string | undefined> = {},
): NodeJS.ProcessEnv {
  return {
    PATH: process.env.PATH ?? "",
    HOME: process.env.HOME ?? tmpdir(),
    ...extra,
  };
}
