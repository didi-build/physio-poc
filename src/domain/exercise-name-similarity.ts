/** Whether two exercise names are similar enough for request conflict and search panels. */
export function exerciseNamesSimilar(a: string, b: string): boolean {
  const left = a.trim().toLowerCase();
  const right = b.trim().toLowerCase();
  if (left.length === 0 || right.length === 0) {
    return false;
  }
  if (left === right) {
    return true;
  }
  if (left.includes(right) || right.includes(left)) {
    return true;
  }
  const leftTokens = tokenize(left);
  const rightTokens = tokenize(right);
  if (leftTokens.length === 0 || rightTokens.length === 0) {
    return false;
  }
  const overlap = leftTokens.filter((token) => rightTokens.includes(token));
  const minLen = Math.min(leftTokens.length, rightTokens.length);
  return overlap.length >= minLen && overlap.length >= 1;
}

function tokenize(value: string): string[] {
  return value
    .split(/[^a-z0-9]+/i)
    .map((part) => part.trim())
    .filter((part) => part.length >= 3);
}
