import { isFakeGoogleOAuthPath } from "../../src/auth/fake-google-http.js";
import type { SessionPublicRouteSample } from "../../src/auth/public-routes.js";

/** Dev/test route table samples; not imported from Worker production code. */
export const FAKE_GOOGLE_OAUTH_AUTH_PATH = "/__fake-google/o/oauth2/v2/auth";

export type DevFakeGoogleHandleRequestSample = {
  readonly branchLabel: "fake-google-oauth";
  readonly samplePath: string;
  readonly method: string;
  readonly extraSessionPublicPath: (pathname: string) => boolean;
};

export const FAKE_GOOGLE_HANDLE_REQUEST_SAMPLE: DevFakeGoogleHandleRequestSample = {
  branchLabel: "fake-google-oauth",
  samplePath: FAKE_GOOGLE_OAUTH_AUTH_PATH,
  method: "GET",
  extraSessionPublicPath: isFakeGoogleOAuthPath,
};

export const FAKE_GOOGLE_SESSION_PUBLIC_SAMPLE: SessionPublicRouteSample = {
  ruleId: "fake-google-dev-test",
  samplePath: FAKE_GOOGLE_OAUTH_AUTH_PATH,
  method: "GET",
  extraSessionPublicPath: isFakeGoogleOAuthPath,
};
