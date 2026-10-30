import { useState } from "react";
import { SIGN_IN_WITH_GOOGLE_LABEL, AUTH_ERROR_MESSAGE } from "../copy/sign-in.js";
import "../styles/sign-in.css";

export type SignInPageProps = {
  returnTo: string;
  authError?: string | null;
};

export function SignInPage({ returnTo, authError }: SignInPageProps) {
  const [busy, setBusy] = useState(false);
  const safeReturn = returnTo.startsWith("/") ? returnTo : "/";

  async function signInWithGoogle() {
    setBusy(true);
    try {
      const response = await fetch("/api/auth/sign-in/social", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "include",
        body: JSON.stringify({
          provider: "google",
          callbackURL: safeReturn,
        }),
      });
      const payload = (await response.json()) as { url?: string };
      if (payload.url) {
        window.location.href = payload.url;
      }
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sign-in-root">
      <div className="sign-in-card">
        {AUTH_ERROR_MESSAGE && authError ? (
          <p className="sign-in-auth-error">{AUTH_ERROR_MESSAGE}</p>
        ) : null}
        <button
          type="button"
          className="sign-in-google-button"
          disabled={busy}
          onClick={() => {
            void signInWithGoogle();
          }}
        >
          {SIGN_IN_WITH_GOOGLE_LABEL}
        </button>
      </div>
    </div>
  );
}
