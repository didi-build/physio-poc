/**
 * @vitest-environment jsdom
 */
import "./setup.js";
import { cleanup, render, screen, waitFor } from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as authClient from "../../src/ui/api/auth-client.js";
import { SignInPage } from "../../src/ui/pages/SignInPage.js";
import {
  AUTH_ERROR_MESSAGE,
  SIGN_IN_WITH_GOOGLE_LABEL,
} from "../../src/ui/copy/sign-in.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("SignInPage (copy and error slot)", () => {
  it("pins literal sign-in copy strings", () => {
    render(<SignInPage returnTo="/programs" authError={null} />);
    expect(document.querySelector(".sign-in-wordmark-text")?.textContent).toBe(
      "Didi Physio",
    );
    expect(
      screen.getByRole("button", { name: SIGN_IN_WITH_GOOGLE_LABEL }),
    ).toBeTruthy();
    expect(SIGN_IN_WITH_GOOGLE_LABEL).toBe("Sign in with Google");
  });

  it("does not render raw ?error= query values in the DOM", () => {
    render(<SignInPage returnTo="/programs" authError="state_mismatch" />);
    expect(screen.queryByText("state_mismatch")).toBeNull();
  });

  it("hides the auth error slot when AUTH_ERROR_MESSAGE is undefined", () => {
    expect(AUTH_ERROR_MESSAGE).toBeUndefined();
    render(<SignInPage returnTo="/programs" authError="not_allowed" />);
    expect(document.querySelector(".sign-in-auth-error")).toBeNull();
  });

  it("uses normalized returnTo as callbackURL when signing in with Google", async () => {
    const postAuthSignInSocial = vi
      .spyOn(authClient, "postAuthSignInSocial")
      .mockResolvedValue(
        new Response(JSON.stringify({ url: "https://oauth.example/start" })),
      );
    const user = userEvent.setup();
    render(<SignInPage returnTo="//evil.example" authError={null} />);
    await user.click(screen.getByRole("button", { name: SIGN_IN_WITH_GOOGLE_LABEL }));
    await waitFor(() => {
      expect(postAuthSignInSocial).toHaveBeenCalledWith({
        provider: "google",
        callbackURL: "/",
      });
    });
  });
});
