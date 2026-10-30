import { ALLOWLIST_REFUSAL_MESSAGE } from "../ui/copy/sign-in.js";

export { ALLOWLIST_REFUSAL_MESSAGE as AUTH_REFUSAL_MESSAGE };

export function authRefusalHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <p>${ALLOWLIST_REFUSAL_MESSAGE}</p>
</body>
</html>`;
}

export function authRefusalResponse(): Response {
  return new Response(authRefusalHtml(), {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
