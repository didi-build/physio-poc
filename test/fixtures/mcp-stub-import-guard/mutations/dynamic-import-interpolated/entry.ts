/** QA mutation: interpolated dynamic import must fail closed without resolving. */
export async function loadForbidden(suffix: string): Promise<unknown> {
  return import(`../../../../../src/storage/repositories/${suffix}.js`);
}
