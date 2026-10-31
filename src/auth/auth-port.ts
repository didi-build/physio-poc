/**
 * Portable auth boundary for practitioner sessions (DIDI-1001).
 */
export type PractitionerSession = {
  readonly practitionerId: string;
  readonly email: string;
  readonly displayName: string;
};

export type AuthPort = {
  /**
   * Returns the signed-in practitioner for this request, or null when there is no valid session.
   */
  getPractitioner(request: Request): Promise<PractitionerSession | null>;

  /**
   * Handles Better Auth routes under `/api/auth/` when the request matches; otherwise null.
   */
  handleAuthRequest(request: Request): Promise<Response | null>;

  /**
   * Clears the session cookie and returns a response for the account menu Sign out action.
   */
  signOut(request: Request): Promise<Response>;
};
