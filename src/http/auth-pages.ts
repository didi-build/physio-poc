export const AUTH_REFUSAL_MESSAGE = "This Google account isn't allowed";

export function authRefusalHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Sign in</title>
</head>
<body>
  <p>${AUTH_REFUSAL_MESSAGE}</p>
</body>
</html>`;
}

export function authRefusalResponse(): Response {
  return new Response(authRefusalHtml(), {
    status: 403,
    headers: { "content-type": "text/html; charset=utf-8" },
  });
}
