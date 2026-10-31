/** Paths owned exclusively by the auth module (`/api/auth/` includes trailing slash; bare `/api/auth` is not). */
export const AUTH_APP_API_PREFIX = "/api/auth/";

export function isAuthAppApiPath(pathname: string): boolean {
  return pathname.startsWith(AUTH_APP_API_PREFIX);
}
