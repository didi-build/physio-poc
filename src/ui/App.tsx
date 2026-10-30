import { Navigate, Route, Routes } from "react-router-dom";
import {
  PHYSIO_APP_ROUTE_PATTERNS,
  PHYSIO_APP_SPA_ROUTE_NAMES,
  physioAppSpaRoutePath,
} from "../app-routes.js";
import { AppShell } from "./layout/AppShell.js";

export type PhysioAppProps = {
  requestsReviewCount?: number;
};

export function PhysioApp({ requestsReviewCount = 0 }: PhysioAppProps) {
  return (
    <Routes>
      <Route element={<AppShell requestsReviewCount={requestsReviewCount} />}>
        <Route
          index
          element={<Navigate to={PHYSIO_APP_ROUTE_PATTERNS.exercises} replace />}
        />
        {PHYSIO_APP_SPA_ROUTE_NAMES.map((routeName) => (
          <Route
            key={routeName}
            path={physioAppSpaRoutePath(routeName)}
            element={null}
          />
        ))}
      </Route>
    </Routes>
  );
}
