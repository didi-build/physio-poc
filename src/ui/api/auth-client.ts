export type FetchFn = (
  input: RequestInfo | URL,
  init?: RequestInit,
) => Promise<Response>;

export type AuthClientOptions = {
  fetchFn?: FetchFn;
};

export function postAuthSignInSocial(
  body: { provider: "google"; callbackURL: string },
  options: AuthClientOptions = {},
): Promise<Response> {
  const fetchFn = options.fetchFn ?? fetch;
  return fetchFn("/api/auth/sign-in/social", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "include",
    body: JSON.stringify(body),
  });
}

export function postAuthSignOut(options: AuthClientOptions = {}): Promise<Response> {
  const fetchFn = options.fetchFn ?? fetch;
  return fetchFn("/api/auth/sign-out", {
    method: "POST",
    credentials: "include",
  });
}
