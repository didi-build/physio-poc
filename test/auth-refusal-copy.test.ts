import { describe, expect, it } from "vitest";
import { handleAuthOAuthErrorRequest } from "../src/http/auth-oauth-error.js";

describe("Allowlist refusal HTML copy", () => {
  it("renders the ticket refusal sentence verbatim", async () => {
    const response = handleAuthOAuthErrorRequest(
      new URL("http://127.0.0.1:8787/api/auth/oauth-error?error=not_allowed"),
    );
    expect(response.status).toBe(403);
    const html = await response.text();
    expect(html).toContain("This Google account isn't allowed");
  });
});
