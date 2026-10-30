import type { ReactElement } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import {
  PHYSIO_APP_ROUTE_PATTERNS,
  PHYSIO_APP_SPA_ROUTE_NAMES,
  physioAppSpaRoutePath,
} from "../app-routes.js";

/** Route tree used by PhysioApp and matchRoutes parity tests. */
export function createPhysioAppRouteObjects(shellElement: ReactElement): RouteObject[] {
  return [
    {
      element: shellElement,
      children: [
        {
          index: true,
          element: <Navigate to={PHYSIO_APP_ROUTE_PATTERNS.exercises} replace />,
        },
        ...PHYSIO_APP_SPA_ROUTE_NAMES.map((routeName) => ({
          id: routeName,
          path: physioAppSpaRoutePath(routeName),
          element: null,
        })),
      ],
    },
  ];
}
