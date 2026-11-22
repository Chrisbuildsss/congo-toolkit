import { useEffect, useState, type ReactNode } from "react";
import {
  CheckIcon,
  EllipsisIcon,
  LibraryIcon,
  LogoMark,
  MenuIcon,
  PanelIcon,
} from "../Icons";
import type { ThemeSetting } from "../types";
import { Separator, useClickOutside } from "./Ui";

const THEME_LABELS: [ThemeSetting, string][] = [
  ["system", "Match system"],
  ["light", "Light"],
  ["dark", "Dark"],
];

export function Sidebar({
  theme,
  expanded,
  showMobileTrigger,
  onToggle,
  exploreActive,
  onExplore,
  onCanvas,
  onTheme,
  onOpenAbout,
  onStop,
}: {
  theme: ThemeSetting;
  expanded: boolean;
  showMobileTrigger: boolean;
  onToggle: () => void;
  exploreActive: boolean;
  onExplore: () => void;
  onCanvas: () => void;
  onTheme: (theme: ThemeSetting) => void;
  onOpenAbout: () => void;
  onStop: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useClickOutside<HTMLDivElement>(profileOpen, () =>
    setProfileOpen(false),
  );

  useEffect(() => {
    if (!expanded) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onToggle();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [expanded, onToggle]);

  const openPage = (action: () => void) => {
    action();
    if (expanded && window.innerWidth <= 900) onToggle();
  };

  const runProfileAction = (action: () => void) => {
    setProfileOpen(false);
    if (expanded && window.innerWidth <= 900) onToggle();
    action();
  };

  return (
    <>
      {!expanded && showMobileTrigger ? (
        <button
          type="button"
          className="mobile-menu-trigger"
          aria-label="Expand sidebar"
          aria-controls="primary-sidebar"
          onClick={onToggle}
        >
          <MenuIcon size={18} />
        </button>
      ) : null}
      {expanded ? (
        <button
          type="button"
          className="sidebar-scrim"
          aria-label="Close navigation"
          onClick={onToggle}
        />
      ) : null}
      <aside
        id="primary-sidebar"
        className={`sidebar ${expanded ? "is-expanded" : ""}`}
        aria-label="Primary"
      >
        <header className="sidebar-header">
          <button
            type="button"
            className="sidebar-menu-button"
            aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"}
            aria-controls="primary-sidebar"
            aria-expanded={expanded}
            onClick={onToggle}
          >
            <MenuIcon size={18} />
          </button>
          {expanded ? (
            <button
              type="button"
              className="sidebar-brand"
              aria-label="Library"
              onClick={() => openPage(onExplore)}
            >
              <LogoMark size={16} />
              <span>Congo</span>
            </button>
          ) : null}
        </header>

        <nav className="sidebar-links">
          <button
            type="button"
            className={`sidebar-link${exploreActive ? " is-active" : ""}`}
            aria-label="Explore"
            aria-current={exploreActive ? "page" : undefined}
            data-tooltip="Explore"
            onClick={() => openPage(onExplore)}
          >
            <LibraryIcon size={20} />
            <span className="sidebar-label">Explore</span>
          </button>
          <button
            type="button"
            className={`sidebar-link${exploreActive ? "" : " is-active"}`}
            aria-label="Canvas"
            aria-current={exploreActive ? undefined : "page"}
            data-tooltip="Canvas"
            onClick={() => openPage(onCanvas)}
          >
            <PanelIcon size={20} />
            <span className="sidebar-label">Canvas</span>
          </button>
        </nav>

        <div className="sidebar-profile" ref={profileRef}>
          <button
            type="button"
            className="avatar-button"
            aria-label="Workspace menu"
            aria-expanded={profileOpen}
            onClick={() => setProfileOpen((value) => !value)}
          >
            <span className="workspace-avatar">
              <LogoMark size={14} />
            </span>
            <span className="sidebar-profile-label">
              <b>Congo</b>
              <small>Local workspace</small>
            </span>
          </button>
          {profileOpen ? (
            <div className="profile-menu" role="menu">
              <div className="profile-summary" role="presentation">
                <span className="workspace-avatar">
                  <LogoMark size={13} />
                </span>
                <span className="profile-summary-copy">
                  <span className="profile-summary-top">
                    <b>Congo workspace</b>
                    <em>Local</em>
                  </span>
                  <span>Browse apps and screens</span>
                </span>
              </div>
              <Separator />
              <span className="profile-menu-label">Appearance</span>
              {THEME_LABELS.map(([value, label]) => (
                <button
                  type="button"
                  key={value}
                  role="menuitemradio"
                  aria-checked={theme === value}
                  className="profile-item"
                  onClick={() => onTheme(value)}
                >
                  <span className="profile-item-icon">
                    {theme === value ? <CheckIcon size={12} /> : null}
                  </span>
                  {label}
                </button>
              ))}
              <Separator />
              <a
                className="profile-item"
                role="menuitem"
                href="https://gocongo.ai/account"
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => setProfileOpen(false)}
              >
                <span className="profile-item-icon">↗</span>
                Congo account
              </a>
              <button
                type="button"
                role="menuitem"
                className="profile-item"
                onClick={() => runProfileAction(onOpenAbout)}
              >
                <span className="profile-item-icon">◌</span>
                About this workspace
              </button>
              <button
                type="button"
                role="menuitem"
                className="profile-item profile-logout"
                onClick={() => runProfileAction(onStop)}
              >
                <span className="profile-item-icon">→</span>
                Stop workspace
              </button>
            </div>
          ) : null}
        </div>
      </aside>
    </>
  );
}

export function Topbar({
  title,
  left,
  right,
  className = "",
  children,
}: {
  title?: ReactNode;
  left?: ReactNode;
  right?: ReactNode;
  className?: string;
  children?: ReactNode;
}) {
  return (
    <header className={`app-topbar ${className}`.trim()}>
      <div className="app-topbar-left">
        {left}
        {title ? <h1 className="app-topbar-title">{title}</h1> : null}
      </div>
      <div className="app-topbar-center">{children}</div>
      {right ? <div className="app-topbar-right">{right}</div> : null}
    </header>
  );
}

export function EllipsisButton({
  label = "Menu",
  onClick,
  active = false,
}: {
  label?: string;
  onClick: () => void;
  active?: boolean;
}) {
  return (
    <button
      type="button"
      className="round-icon-button"
      aria-label={label}
      data-active={active ? "true" : undefined}
      onClick={onClick}
    >
      <EllipsisIcon />
    </button>
  );
}
