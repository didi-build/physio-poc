export type BetterAuthRuntime = {
  handler(request: Request): Promise<Response>;
  api: {
    getSession(input: { headers: Headers }): Promise<{
      session?: { token?: string; id?: string };
      user?: {
        id?: string;
        email?: string | null;
        name?: string | null;
        practitionerId?: string | null;
      };
    } | null>;
  };
  $context: Promise<{
    baseURL: string;
    secret: string;
    internalAdapter: unknown;
  }>;
};

export type BetterAuthHandle = {
  auth: BetterAuthRuntime;
  sessionCookieName: string;
  mcpResourceUrl?: string;
};
