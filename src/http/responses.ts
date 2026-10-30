const JSON_HEADERS = { "content-type": "application/json" };

export function jsonUnauthorized(): Response {
  return Response.json(
    { error: "unauthorized" },
    { status: 401, headers: JSON_HEADERS },
  );
}

export function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { location },
  });
}
