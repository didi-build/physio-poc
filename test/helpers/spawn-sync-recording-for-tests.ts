import * as childProcess from "node:child_process";

export const recordedSpawnEnvs: NodeJS.ProcessEnv[] = [];

export function resetRecordedSpawnEnvsForTests(): void {
  recordedSpawnEnvs.length = 0;
}

export function spawnSyncRecording(
  ...args: Parameters<typeof childProcess.spawnSync>
): ReturnType<typeof childProcess.spawnSync> {
  const options = args[2];
  if (options && typeof options === "object" && "env" in options) {
    recordedSpawnEnvs.push(options.env as NodeJS.ProcessEnv);
  }
  return childProcess.spawnSync(...args);
}
