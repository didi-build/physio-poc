/**
 * Summarize Vitest JUnit XML (one testsuite element per test file).
 * Top-level testsuites may omit skipped; sum per-testsuite attributes.
 */
export function summarizeVitestJUnitXml(xml) {
  const suiteTags = [...xml.matchAll(/<testsuite\b[^>]*>/g)].map((match) => match[0]);
  let tests = 0;
  let skipped = 0;
  let failures = 0;
  let errors = 0;
  for (const tag of suiteTags) {
    tests += Number(tag.match(/\btests="(\d+)"/)?.[1] ?? 0);
    skipped += Number(tag.match(/\bskipped="(\d+)"/)?.[1] ?? 0);
    failures += Number(tag.match(/\bfailures="(\d+)"/)?.[1] ?? 0);
    errors += Number(tag.match(/\berrors="(\d+)"/)?.[1] ?? 0);
  }
  const failed = failures + errors;
  const executed = Math.max(0, tests - skipped);
  const passed = Math.max(0, executed - failed);
  return { tests, skipped, failures, errors, failed, executed, passed };
}
