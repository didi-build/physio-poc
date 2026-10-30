/** QA mutation: static template-literal dynamic import of storage. */
export async function loadForbidden(): Promise<unknown> {
  return import(`../../../../../src/storage/repositories/programs.js`);
}
