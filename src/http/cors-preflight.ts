export function handleOptionsPreflight(request: Request): Response {
  const headers = new Headers();
  const origin = request.headers.get("Origin");
  if (origin) {
    headers.set("Access-Control-Allow-Origin", origin);
    headers.set(
      "Access-Control-Allow-Methods",
      "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
    );
    headers.set(
      "Access-Control-Allow-Headers",
      request.headers.get("Access-Control-Request-Headers") ?? "*",
    );
    headers.set("Vary", "Origin");
  }
  return new Response(null, { status: 204, headers });
}
