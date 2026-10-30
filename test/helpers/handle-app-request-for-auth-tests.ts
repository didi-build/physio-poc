import { handleRequest, type AppDependencies } from "../../src/http/app.js";
import { handleTestNonGoogleOAuthAuthorizeRequest } from "./test-non-google-oauth-authorize.js";

export type AuthTestRequestOptions = {
  testNonGoogleOAuthProviderId?: string;
};

export async function handleAppRequestForAuthTests(
  request: Request,
  deps: AppDependencies,
  options: AuthTestRequestOptions = {},
): Promise<Response> {
  if (
    deps.enableFakeGoogleRoutes === true &&
    typeof options.testNonGoogleOAuthProviderId === "string"
  ) {
    const testOAuth = await handleTestNonGoogleOAuthAuthorizeRequest(
      request,
      deps.config.auth.authBaseUrl,
      options.testNonGoogleOAuthProviderId,
    );
    if (testOAuth) {
      return testOAuth;
    }
  }
  return handleRequest(request, deps);
}
