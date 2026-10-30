import { Navigate, Route, Routes, useSearchParams } from "react-router-dom";
import { AppShell } from "./layout/AppShell.js";
import { PublicLinkPage } from "./pages/PublicLinkPage.js";
import { SignInPage } from "./pages/SignInPage.js";
import { normalizeReturnTo } from "./routing/return-to.js";

export type PhysioAppProps = {
  requestsReviewCount?: number;
};

function SignInRoute() {
  const [params] = useSearchParams();
  const returnTo = normalizeReturnTo(params.get("returnTo"));
  return <SignInPage returnTo={returnTo} />;
}

export function PhysioApp({ requestsReviewCount = 0 }: PhysioAppProps) {
  return (
    <Routes>
      <Route path="/sign-in" element={<SignInRoute />} />
      <Route path="/l/:code" element={<PublicLinkPage />} />
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
