export type BetterAuthRuntime = {
  handler(request: Request): Promise<Response>;
  api: {
    getSession(input: { headers: Headers }): Promise<{
      session?: { token?: string };
      user?: {
        email?: string | null;
        name?: string | null;
        practitionerId?: string | null;
      };
    } | null>;
  };
};

export type BetterAuthHandle = {
  auth: BetterAuthRuntime;
  sessionCookieName: string;
};
