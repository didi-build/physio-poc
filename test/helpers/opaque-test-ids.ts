/** Deterministic UUID v4-shaped ids for tests (valid version and variant nibbles). */
export function testOpaqueEntityId(seed: string): string {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  const suffix = (BigInt(hash >>> 0) % (1n << 48n)).toString(16).padStart(12, "0");
  return `00000000-0000-4000-8000-${suffix}`;
}

/** Map legacy short fixture seeds to stable UUID v4 test ids. */
export function id(seed: string): string {
  return testOpaqueEntityId(seed);
}
