import type { RouteObject } from "react-router-dom";
import { PHYSIO_APP_SPA_ROUTE_NAMES, physioAppSpaRoutePath } from "../app-routes.js";

/** Route tree shape used by PhysioApp (for matchRoutes parity tests and docs). */
export function createPhysioAppRouteObjects(): RouteObject[] {
  return [
    {
      children: [
        { index: true },
        ...PHYSIO_APP_SPA_ROUTE_NAMES.map((routeName) => ({
          path: physioAppSpaRoutePath(routeName),
        })),
      ],
    },
  ];
}
