import { NavLink } from "react-router-dom";
import {
  ACCOUNT_MY_DEFAULTS,
  ACCOUNT_MY_DEFAULTS_DETAIL,
  ACCOUNT_SIGN_OUT,
  ACCOUNT_SIGNED_IN_LINE,
  NAV_TAB_EXERCISES,
  NAV_TAB_PROGRAMS,
  NAV_TAB_REQUESTS_DESKTOP,
  NAV_TAB_REQUESTS_PHONE,
  NAV_TAB_ROUTINES,
} from "../copy/nav.js";

export type MainNavProps = {
  requestsReviewCount: number;
  variant: "top" | "tab";
};

const tabs = [
  {
    to: "/exercises",
    desktopLabel: NAV_TAB_EXERCISES,
    phoneLabel: NAV_TAB_EXERCISES,
    showCount: false,
  },
  {
    to: "/routines",
    desktopLabel: NAV_TAB_ROUTINES,
    phoneLabel: NAV_TAB_ROUTINES,
    showCount: false,
  },
  {
    to: "/programs",
    desktopLabel: NAV_TAB_PROGRAMS,
    phoneLabel: NAV_TAB_PROGRAMS,
    showCount: false,
  },
  {
    to: "/requests",
    desktopLabel: NAV_TAB_REQUESTS_DESKTOP,
    phoneLabel: NAV_TAB_REQUESTS_PHONE,
    showCount: true,
  },
] as const;

export function MainNav({ requestsReviewCount, variant }: MainNavProps) {
  if (variant === "top") {
    return (
      <nav className="shell-top-nav" aria-label="Main">
        {tabs.map((tab) => (
          <NavLink
            key={tab.to}
            to={tab.to}
            end
            className={({ isActive }) =>
              `shell-top-nav-link${isActive ? " shell-top-nav-link--active" : ""}`
            }
          >
            {({ isActive }) => (
              <>
                <span aria-current={isActive ? "page" : undefined}>
                  {tab.desktopLabel}
                </span>
                {tab.showCount && requestsReviewCount > 0 ? (
                  <span className="shell-count-badge">{requestsReviewCount}</span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </nav>
    );
  }

  return (
    <nav className="shell-tab-bar" aria-label="Main">
      <div className="shell-tab-bar-inner">
        {tabs.map((tab) => (
          <NavLink key={tab.to} to={tab.to} end className="shell-tab-link">
            {({ isActive }) => (
              <>
                <span className="shell-tab-icon-wrap" aria-hidden />
                <span aria-current={isActive ? "page" : undefined}>
                  {tab.phoneLabel}
                </span>
                {tab.showCount && requestsReviewCount > 0 ? (
                  <span className="shell-tab-count">{requestsReviewCount}</span>
                ) : null}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}

export type AccountMenuProps = {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
};

export function AccountMenu({ open, onToggle, onClose }: AccountMenuProps) {
  return (
    <div className="shell-header-actions">
      <div className="shell-account-wrap">
        <button
          type="button"
          className="shell-account-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          onClick={onToggle}
        >
          <span className="shell-account-avatar" aria-hidden>
            K
          </span>
          <span className="shell-account-name">Kojo</span>
        </button>
        {open ? (
          <>
            <button
              type="button"
              className="shell-menu-backdrop"
              aria-label="Close menu"
              tabIndex={-1}
              onClick={onClose}
            />
            <div role="menu" className="shell-menu-panel">
              <div className="shell-menu-signed-in">{ACCOUNT_SIGNED_IN_LINE}</div>
              <NavLink
                to="/defaults"
                role="menuitem"
                className="shell-menu-item"
                onClick={onClose}
              >
                <span>{ACCOUNT_MY_DEFAULTS}</span>
                <span className="shell-menu-item-detail">
                  {ACCOUNT_MY_DEFAULTS_DETAIL}
                </span>
              </NavLink>
              <a
                href="#"
                role="menuitem"
                className="shell-menu-item shell-menu-sign-out"
                onClick={(event) => {
                  event.preventDefault();
                  onClose();
                }}
              >
                {ACCOUNT_SIGN_OUT}
              </a>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
