import type { ReactElement } from "react";
import { Navigate, type RouteObject } from "react-router-dom";
import {
  PHYSIO_APP_ROUTE_PATTERNS,
  PHYSIO_APP_SPA_ROUTE_NAMES,
  physioAppSpaRoutePath,
  type PhysioAppSpaRouteName,
} from "../app-routes.js";

export type PhysioAppRouteElements = Partial<
  Record<PhysioAppSpaRouteName, ReactElement | null>
>;

/** Route tree used by PhysioApp and matchRoutes parity tests. */
export function createPhysioAppRouteObjects(
  shellElement: ReactElement,
  routeElements: PhysioAppRouteElements = {},
): RouteObject[] {
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
          element: routeElements[routeName] ?? null,
        })),
      ],
    },
  ];
}
