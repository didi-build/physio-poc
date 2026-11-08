import type { ReactNode } from "react";
import { SessionReadCacheProvider } from "../../src/ui/api/session-read-cache-context.js";
import { PractitionerSessionProvider } from "../../src/ui/api/practitioner-session-context.js";
import { stubPractitionerSessionClient } from "./fake-practitioner-session-fixture.js";

export function NavigationTestProviders({ children }: { children: ReactNode }) {
  return (
    <PractitionerSessionProvider client={stubPractitionerSessionClient()}>
      <SessionReadCacheProvider>{children}</SessionReadCacheProvider>
    </PractitionerSessionProvider>
  );
}
