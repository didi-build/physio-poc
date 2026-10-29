import { useState } from "react";
import { Outlet } from "react-router-dom";
import { ToastProvider } from "../components/Toast.js";
import { AccountMenu, MainNav } from "./ShellNav.js";

export type AppShellProps = {
  requestsReviewCount?: number;
};

export function AppShell({ requestsReviewCount = 0 }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <ToastProvider>
      <div className="shell-root">
        <div className="shell-frame">
          <header className="shell-header">
            <div className="shell-header-inner">
              <div className="shell-brand-mark" aria-hidden>
                D
              </div>
              <MainNav variant="top" requestsReviewCount={requestsReviewCount} />
              <AccountMenu
                open={menuOpen}
                onToggle={() => {
                  setMenuOpen((open) => !open);
                }}
                onClose={() => {
                  setMenuOpen(false);
                }}
              />
            </div>
          </header>
          <main className="shell-main">
            <Outlet />
          </main>
        </div>
        <MainNav variant="tab" requestsReviewCount={requestsReviewCount} />
      </div>
    </ToastProvider>
  );
}
