export type HttpResponseFingerprint = {
  status: number;
  headerLines: string[];
  body: string;
};

export async function httpResponseFingerprint(
  response: Response,
): Promise<HttpResponseFingerprint> {
  const headerLines: string[] = [];
  const seen = new Set<string>();
  const pushHeader = (name: string, value: string) => {
    const line = `${name}: ${value}`;
    if (seen.has(line)) {
      return;
    }
    seen.add(line);
    headerLines.push(line);
  };

  response.headers.forEach((value, name) => {
    if (name === "set-cookie") {
      return;
    }
    pushHeader(name, value);
  });
  if (typeof response.headers.getSetCookie === "function") {
    for (const cookie of response.headers.getSetCookie()) {
      pushHeader("set-cookie", cookie);
    }
  }
  headerLines.sort();
  return {
    status: response.status,
    headerLines,
    body: await response.text(),
  };
}
