import { Navigate, Route, Routes } from "react-router-dom";
import { AppShell } from "./layout/AppShell.js";

export type PhysioAppProps = {
  requestsReviewCount?: number;
};

export function PhysioApp({ requestsReviewCount = 0 }: PhysioAppProps) {
  return (
    <Routes>
      <Route element={<AppShell requestsReviewCount={requestsReviewCount} />}>
        <Route index element={<Navigate to="/exercises" replace />} />
        <Route path="exercises" element={null} />
        <Route path="routines" element={null} />
        <Route path="programs" element={null} />
        <Route path="requests" element={null} />
        <Route path="defaults" element={null} />
      </Route>
    </Routes>
  );
}
