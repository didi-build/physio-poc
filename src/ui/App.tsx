import { useRoutes } from "react-router-dom";
import { AppShell } from "./layout/AppShell.js";
import { createPhysioAppRouteObjects } from "./physio-app-match-routes.js";

export type PhysioAppProps = {
  requestsReviewCount?: number;
};

export function PhysioApp({ requestsReviewCount = 0 }: PhysioAppProps) {
  return useRoutes(
    createPhysioAppRouteObjects(<AppShell requestsReviewCount={requestsReviewCount} />),
  );
}
