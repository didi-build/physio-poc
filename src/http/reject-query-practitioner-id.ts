const JSON_HEADERS = { "content-type": "application/json" };

export function rejectQueryPractitionerId(url: URL): Response | null {
  if (
    url.searchParams.has("practitionerId") ||
    url.searchParams.has("practitioner_id") ||
    url.searchParams.has("as")
  ) {
    return Response.json(
      { error: "invalid_input", message: "invalid_input" },
      { status: 400, headers: JSON_HEADERS },
    );
  }
  return null;
}
