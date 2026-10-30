import { useEffect, useRef } from "react";
import { NavLink } from "react-router-dom";
import { PHYSIO_APP_ROUTE_PATTERNS } from "../../app-routes.js";
import { postAuthSignOut } from "../api/auth-client.js";
import { ACCOUNT_DISPLAY_NAME, ARIA_CLOSE_MENU } from "../copy/a11y.js";
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
    to: PHYSIO_APP_ROUTE_PATTERNS.exercises,
    desktopLabel: NAV_TAB_EXERCISES,
    phoneLabel: NAV_TAB_EXERCISES,
    showCount: false,
  },
  {
    to: PHYSIO_APP_ROUTE_PATTERNS.routines,
    desktopLabel: NAV_TAB_ROUTINES,
    phoneLabel: NAV_TAB_ROUTINES,
    showCount: false,
  },
  {
    to: PHYSIO_APP_ROUTE_PATTERNS.programs,
    desktopLabel: NAV_TAB_PROGRAMS,
    phoneLabel: NAV_TAB_PROGRAMS,
    showCount: false,
  },
  {
    to: PHYSIO_APP_ROUTE_PATTERNS.requests,
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
            <>
              {tab.desktopLabel}
              {tab.showCount && requestsReviewCount > 0 ? (
                <span className="shell-count-badge">{requestsReviewCount}</span>
              ) : null}
            </>
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
            <>
              <span className="shell-tab-icon-wrap" aria-hidden />
              {tab.phoneLabel}
              {tab.showCount && requestsReviewCount > 0 ? (
                <span className="shell-tab-count">{requestsReviewCount}</span>
              ) : null}
            </>
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
  const wrapRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  const closeMenu = () => {
    onCloseRef.current();
    triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open || !menuRef.current || !wrapRef.current) {
      return;
    }
    const menu = menuRef.current;
    const wrap = wrapRef.current;
    const menuItems = () => [
      ...menu.querySelectorAll<HTMLElement>('[role="menuitem"]'),
    ];

    menuItems()[0]?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeMenu();
        return;
      }
      if (event.key === "Tab") {
        queueMicrotask(() => {
          const active = document.activeElement;
          if (!active || !wrap.contains(active)) {
            onCloseRef.current();
          }
        });
        return;
      }
      if (event.key !== "ArrowDown" && event.key !== "ArrowUp") {
        return;
      }
      event.preventDefault();
      const items = menuItems();
      if (items.length === 0) {
        return;
      }
      const activeIndex = items.indexOf(document.activeElement as HTMLElement);
      let nextIndex = 0;
      if (event.key === "ArrowDown") {
        nextIndex = activeIndex < 0 ? 0 : (activeIndex + 1) % items.length;
      } else {
        nextIndex =
          activeIndex < 0
            ? items.length - 1
            : (activeIndex - 1 + items.length) % items.length;
      }
      items[nextIndex]?.focus();
    };

    const onFocusOut = (event: FocusEvent) => {
      const related = event.relatedTarget as Node | null;
      if (related === null) {
        return;
      }
      if (menu.contains(related)) {
        return;
      }
      if (wrap.contains(related)) {
        return;
      }
    };

    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (wrap.contains(target)) {
        return;
      }
      onCloseRef.current();
    };

    wrap.addEventListener("keydown", onKeyDown);
    wrap.addEventListener("focusout", onFocusOut);
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      wrap.removeEventListener("keydown", onKeyDown);
      wrap.removeEventListener("focusout", onFocusOut);
      document.removeEventListener("pointerdown", onPointerDown, true);
    };
  }, [open]);

  return (
    <div className="shell-header-actions">
      <div ref={wrapRef} className="shell-account-wrap">
        <button
          ref={triggerRef}
          type="button"
          className="shell-account-trigger"
          aria-haspopup="menu"
          aria-expanded={open}
          aria-label="Account menu"
          onClick={onToggle}
        >
          <span
            className="shell-account-avatar"
            aria-hidden
            data-testid="shell-account-avatar"
          >
            K
          </span>
          <span className="shell-account-name">{ACCOUNT_DISPLAY_NAME}</span>
        </button>
        {open ? (
          <>
            <button
              type="button"
              className="shell-menu-backdrop"
              aria-label={ARIA_CLOSE_MENU}
              tabIndex={-1}
              onClick={closeMenu}
            />
            <div ref={menuRef} role="menu" className="shell-menu-panel">
              <div className="shell-menu-signed-in">{ACCOUNT_SIGNED_IN_LINE}</div>
              <NavLink
                to={PHYSIO_APP_ROUTE_PATTERNS.defaults}
                role="menuitem"
                className="shell-menu-item"
                onClick={closeMenu}
              >
                <span>{ACCOUNT_MY_DEFAULTS}</span>
                <span className="shell-menu-item-detail">
                  {ACCOUNT_MY_DEFAULTS_DETAIL}
                </span>
              </NavLink>
              <button
                type="button"
                role="menuitem"
                className="shell-menu-item shell-menu-sign-out"
                onClick={(event) => {
                  event.preventDefault();
                  closeMenu();
                  void postAuthSignOut().then(() => {
                    window.location.href = "/sign-in";
                  });
                }}
              >
                {ACCOUNT_SIGN_OUT}
              </button>
            </div>
          </>
        ) : null}
      </div>
    </div>
  );
}
