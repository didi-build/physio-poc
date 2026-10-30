const BASE64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

export const SHARE_LINK_TOKEN_BYTE_LENGTH = 32;

/** Base64url encoding of 32 bytes without padding. */
export const SHARE_LINK_TOKEN_CHAR_LENGTH = 43;

function base64UrlFromBytes(bytes: Uint8Array): string {
  let output = "";
  for (let i = 0; i < bytes.length; i += 3) {
    const a = bytes[i] ?? 0;
    const b = i + 1 < bytes.length ? (bytes[i + 1] ?? 0) : 0;
    const c = i + 2 < bytes.length ? (bytes[i + 2] ?? 0) : 0;
    const triplet = (a << 16) | (b << 8) | c;
    output += BASE64[(triplet >> 18) & 63];
    output += BASE64[(triplet >> 12) & 63];
    output += i + 1 < bytes.length ? BASE64[(triplet >> 6) & 63] : "=";
    output += i + 2 < bytes.length ? BASE64[triplet & 63] : "=";
  }
  return output.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

/** Opaque share-link token from a CSPRNG (Web Crypto). */
export function generateShareLinkToken(): string {
  const bytes = new Uint8Array(SHARE_LINK_TOKEN_BYTE_LENGTH);
  crypto.getRandomValues(bytes);
  return base64UrlFromBytes(bytes);
}

export function encodeShareLinkTokenFromBytes(bytes: Uint8Array): string {
  return base64UrlFromBytes(bytes);
}
