import { ALLOWLIST_REFUSAL_ERROR } from "../auth/allowed-emails.js";
import { authRefusalResponse } from "./auth-pages.js";
import { redirectResponse } from "./responses.js";

const AUTH_OAUTH_ERROR_PATH = "/api/auth/oauth-error";
const LEGACY_REFUSED_PATH = "/api/auth/refused";

export function isAuthOAuthErrorPath(pathname: string): boolean {
  return pathname === AUTH_OAUTH_ERROR_PATH || pathname === LEGACY_REFUSED_PATH;
}

/**
 * Routes Better Auth OAuth/API errors: allowlist refusal HTML only for `not_allowed`.
 */
export function handleAuthOAuthErrorRequest(url: URL): Response {
  const error = url.searchParams.get("error");
  if (error === ALLOWLIST_REFUSAL_ERROR) {
    return authRefusalResponse();
  }

  const signInParams = new URLSearchParams();
  if (error) {
    signInParams.set("error", error);
  }
  const errorDescription = url.searchParams.get("error_description");
  if (errorDescription) {
    signInParams.set("error_description", errorDescription);
  }
  const query = signInParams.toString();
  return redirectResponse(query.length > 0 ? `/sign-in?${query}` : "/sign-in");
}
