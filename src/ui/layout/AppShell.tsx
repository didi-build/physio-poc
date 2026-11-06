import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { ToastProvider } from "../components/Toast.js";
import { NAV_TAB_REQUESTS_DESKTOP, NAV_TAB_REQUESTS_PHONE } from "../copy/nav.js";
import { AccountMenu, MainNav } from "./ShellNav.js";

export type AppShellProps = {
  requestsReviewCount?: number;
};

const SHELL_DESKTOP_MEDIA_QUERY = "(min-width: 1024px)";

export function AppShell({ requestsReviewCount = 0 }: AppShellProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const [isDesktopNav, setIsDesktopNav] = useState(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia(SHELL_DESKTOP_MEDIA_QUERY).matches,
  );

  useEffect(() => {
    const mq = window.matchMedia(SHELL_DESKTOP_MEDIA_QUERY);
    const onChange = () => {
      setIsDesktopNav(mq.matches);
    };
    mq.addEventListener("change", onChange);
    setIsDesktopNav(mq.matches);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const requestsMenuLabel = isDesktopNav
    ? NAV_TAB_REQUESTS_DESKTOP
    : NAV_TAB_REQUESTS_PHONE;

  return (
    <ToastProvider>
      <div className="shell-root">
        <div className="shell-frame">
          <header className="shell-header">
            <div className="shell-header-inner">
              <div
                className="shell-brand-mark"
                aria-hidden
                data-testid="shell-brand-mark"
              >
                D
              </div>
              <MainNav variant="top" />
              <AccountMenu
                open={menuOpen}
                onToggle={() => {
                  setMenuOpen((open) => !open);
                }}
                onClose={() => {
                  setMenuOpen(false);
                }}
                requestsReviewCount={requestsReviewCount}
                requestsMenuLabel={requestsMenuLabel}
              />
            </div>
          </header>
          <main className="shell-main">
            <Outlet />
          </main>
        </div>
        <MainNav variant="tab" />
      </div>
    </ToastProvider>
  );
}
