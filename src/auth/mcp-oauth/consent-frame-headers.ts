export const MCP_OAUTH_CONSENT_FRAME_HEADERS = {
  "Content-Security-Policy": "frame-ancestors 'none'",
  "X-Frame-Options": "DENY",
} as const;

export function withMcpOAuthConsentFrameHeaders(init?: ResponseInit): ResponseInit {
  const headers = new Headers(init?.headers);
  for (const [name, value] of Object.entries(MCP_OAUTH_CONSENT_FRAME_HEADERS)) {
    headers.set(name, value);
  }
  return { ...init, headers };
}
