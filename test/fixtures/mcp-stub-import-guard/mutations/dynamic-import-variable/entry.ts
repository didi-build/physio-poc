/** QA mutation: variable dynamic import must fail closed without resolving. */
const modulePath = "../../../../../src/storage/repositories/programs.js";

export async function loadForbidden(): Promise<unknown> {
  return import(modulePath);
}
