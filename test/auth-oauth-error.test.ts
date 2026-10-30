import { describe, expect, it } from "vitest";
import { ALLOWLIST_REFUSAL_ERROR } from "../src/auth/allowed-emails.js";
import { AUTH_REFUSAL_MESSAGE } from "../src/http/auth-pages.js";
import { handleAuthOAuthErrorRequest } from "../src/http/auth-oauth-error.js";

describe("handleAuthOAuthErrorRequest", () => {
  it("returns allowlist refusal HTML only for not_allowed", () => {
    const response = handleAuthOAuthErrorRequest(
      new URL(
        `http://127.0.0.1:8787/api/auth/oauth-error?error=${ALLOWLIST_REFUSAL_ERROR}`,
      ),
    );
    expect(response.status).toBe(403);
    return expect(response.text()).resolves.toContain(AUTH_REFUSAL_MESSAGE);
  });

  it("redirects other OAuth errors to sign-in without refusal HTML", async () => {
    const response = handleAuthOAuthErrorRequest(
      new URL("http://127.0.0.1:8787/api/auth/oauth-error?error=state_mismatch"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe("/sign-in?error=state_mismatch");
    const body = await response.text();
    expect(body).not.toContain(AUTH_REFUSAL_MESSAGE);
  });

  it("treats legacy /api/auth/refused the same as oauth-error", () => {
    const response = handleAuthOAuthErrorRequest(
      new URL("http://127.0.0.1:8787/api/auth/refused?error=state_mismatch"),
    );
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toContain("/sign-in");
  });
});
