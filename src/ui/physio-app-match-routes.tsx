import type { ReactElement } from "react";
import { useSearchParams } from "react-router-dom";
import { Navigate, type RouteObject } from "react-router-dom";
import {
  PHYSIO_APP_ROUTE_PATTERNS,
  PHYSIO_APP_SPA_ROUTE_NAMES,
  physioAppSpaRoutePath,
} from "../app-routes.js";
import { PublicLinkPage } from "./pages/PublicLinkPage.js";
import { SignInPage } from "./pages/SignInPage.js";
import { normalizeReturnTo } from "./routing/return-to.js";

function SignInRoute() {
  const [params] = useSearchParams();
  const returnTo = normalizeReturnTo(params.get("returnTo"));
  const authError = params.get("error");
  return <SignInPage returnTo={returnTo} authError={authError} />;
}

/** Route tree used by PhysioApp and matchRoutes parity tests. */
export function createPhysioAppRouteObjects(shellElement: ReactElement): RouteObject[] {
  return [
    { path: "/sign-in", element: <SignInRoute /> },
    { path: "/l/:code", element: <PublicLinkPage /> },
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
