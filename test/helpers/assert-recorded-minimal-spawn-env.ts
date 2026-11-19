import { expect } from "vitest";
import { minimalChildProcessEnv } from "./minimal-child-process-env.js";
import { recordedSpawnEnvs } from "./spawn-sync-recording-for-tests.js";

const FORBIDDEN_ENV_KEYS = [
  "CLOUDFLARE_API_TOKEN",
  "GITHUB_TOKEN",
  "PHYSIO_DIDI_1240_SPAWN_ENV_PROBE",
] as const;

export function assertRecordedSpawnEnvEquals(expected: NodeJS.ProcessEnv): void {
  expect(recordedSpawnEnvs).toHaveLength(1);
  expect(recordedSpawnEnvs[0]).toEqual(expected);
  for (const key of FORBIDDEN_ENV_KEYS) {
    expect(recordedSpawnEnvs[0]?.[key]).toBeUndefined();
  }
}

export function assertRecordedSpawnEnvIsMinimalCheck(): void {
  assertRecordedSpawnEnvEquals(minimalChildProcessEnv());
}

export function assertRecordedSpawnEnvIsMinimalPrepare(databaseId: string): void {
  assertRecordedSpawnEnvEquals(
    minimalChildProcessEnv({ PHYSIO_D1_DATABASE_ID: databaseId }),
  );
}
