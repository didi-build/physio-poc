/** CIMD client_id host must match every redirect_uri host (DIDI-1043). */
export function cimdRedirectHostsMatchClientId(
  clientIdUrl: string,
  redirectUris: readonly string[],
): boolean {
  let clientHost: string;
  try {
    clientHost = new URL(clientIdUrl).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (redirectUris.length === 0) {
    return false;
  }
  for (const redirectUri of redirectUris) {
    try {
      if (new URL(redirectUri).hostname.toLowerCase() !== clientHost) {
        return false;
      }
    } catch {
      return false;
    }
  }
  return true;
}
