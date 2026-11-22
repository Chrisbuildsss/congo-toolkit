import { useCallback, useEffect, useState } from "react";
import { AboutModal } from "./components/AppModals";
import { Sidebar } from "./components/AppShell";
import { Toast } from "./components/Ui";
import { LogoMark } from "./Icons";
import { api, getState, getStatus, saveSelection, token } from "./api";
import type { Design, SelectionItem, ThemeSetting, WorkspaceStatus } from "./types";
import CanvasView from "./views/Canvas";
import CanvasIndex from "./views/CanvasIndex";
import DesignDetail from "./views/DesignDetail";
import LibraryView, { type LibraryMode } from "./views/Library";

type Route = { name: "library"; mode: LibraryMode; app?: string } | { name: "canvas"; id?: string };

function parseRoute(path: string): Route {
  const [, first, second, third] = path.split("/");
  if (first === "canvas") return { name: "canvas", id: /^[a-f0-9]{16}$/.test(second ?? "") ? second : undefined };
  const explore = first === "explore" || first === "library";
  if (explore && second === "screens") return { name: "library", mode: "screens" };
  if (explore && second === "saved") return { name: "library", mode: "saved" };
  if (explore && second === "apps" && third) return { name: "library", mode: "apps", app: decodeURIComponent(third) };
  return { name: "library", mode: "apps" };
}

function routePath(route: Route) {
  if (route.name === "canvas") return route.id ? `/canvas/${route.id}` : "/canvas";
  if (route.app) return `/explore/apps/${encodeURIComponent(route.app)}`;
  return route.mode === "screens" ? "/explore/screens" : route.mode === "saved" ? "/explore/saved" : "/explore";
}

function applyTheme(theme: ThemeSetting) {
  const root = document.documentElement;
  if (theme === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", theme);
}

function NoToken() {
  return (
    <div className="auth-screen workspace-locked">
      <div className="auth-panel">
        <LogoMark size={28} />
        <h1>Open the workspace from your computer</h1>
        <p>
          Run <code>npx gocongo workspace</code>, or ask your AI to open the Congo workspace. The link it opens
          carries this session's key.
        </p>
      </div>
    </div>
  );
}

export default function App() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.pathname));
  const [sidebarExpanded, setSidebarExpanded] = useState(false);
  const [theme, setTheme] = useState<ThemeSetting>("system");
  const [status, setStatus] = useState<WorkspaceStatus | null>(null);
  const [offline, setOffline] = useState(false);
  const [selection, setSelection] = useState<SelectionItem[]>([]);
  const [selectionBusy, setSelectionBusy] = useState(true);
  const [detail, setDetail] = useState<{ design: Design; context?: string } | null>(null);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const hasToken = Boolean(token());

  const navigate = useCallback((next: Route) => {
    setRoute(next);
    setDetail(null);
    const path = routePath(next);
    if (window.location.pathname !== path) window.history.pushState({}, "", path);
    window.setTimeout(() => document.querySelector(".main-scroll")?.scrollTo({ top: 0 }), 0);
  }, []);

  useEffect(() => {
    if (!hasToken) return;
    let active = true;
    Promise.all([getState(), getStatus()])
      .then(([state, status]) => {
        if (!active) return;
        setTheme(state.settings.theme);
        setStatus(status);
        setSelection(state.tray.items);
        setSelectionBusy(false);
      })
      .catch(() => {
        if (active) setOffline(true);
      });
    return () => {
      active = false;
    };
  }, [hasToken]);

  useEffect(() => {
    if (window.location.pathname === "/") window.history.replaceState({}, "", "/explore");
    const onPopState = () => {
      setDetail(null);
      setRoute(parseRoute(window.location.pathname));
    };
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  if (!hasToken) return <NoToken />;

  const changeSelection = async (change: Parameters<typeof saveSelection>[0]) => {
    setSelectionBusy(true);
    try {
      const { tray } = await saveSelection(change);
      setSelection(tray.items);
    } catch (error) {
      setToast((error as Error).message);
    } finally {
      setSelectionBusy(false);
    }
  };

  const changeTheme = async (next: ThemeSetting) => {
    setTheme(next);
    try {
      await api("/api/settings", { theme: next });
    } catch (error) {
      setToast((error as Error).message);
    }
  };

  const stopWorkspace = async () => {
    try {
      await api("/api/stop", {});
      setOffline(true);
    } catch (error) {
      setToast((error as Error).message);
    }
  };

  return (
    <div className={`app-shell ${sidebarExpanded ? "sidebar-expanded" : "sidebar-collapsed"}`}>
      <Sidebar
        theme={theme}
        expanded={sidebarExpanded}
        showMobileTrigger={!detail}
        onToggle={() => setSidebarExpanded((expanded) => !expanded)}
        exploreActive={route.name === "library"}
        onExplore={() => navigate({ name: "library", mode: "apps" })}
        onCanvas={() => navigate({ name: "canvas" })}
        onTheme={(theme) => void changeTheme(theme)}
        onOpenAbout={() => setAboutOpen(true)}
        onStop={() => void stopWorkspace()}
      />

      <div className="app-content">
        {offline ? (
          <div className="workspace-banner" role="status">
            The workspace is offline. Run npx gocongo workspace to open it again.
          </div>
        ) : null}

        {route.name === "canvas" ? (
          route.id ? (
            <CanvasView key={route.id} id={route.id} onBack={() => navigate({ name: "canvas" })} />
          ) : (
            <CanvasIndex onOpen={(id) => navigate({ name: "canvas", id })} />
          )
        ) : (
          <LibraryView
            mode={route.mode}
            appSlug={route.app}
            onMode={(mode) => navigate({ name: "library", mode })}
            onOpenApp={(slug) => navigate({ name: "library", mode: "apps", app: slug })}
            onBack={() => navigate({ name: "library", mode: "apps" })}
            onOpenItem={(design, context) => setDetail({ design, context })}
            selection={selection}
            selectionBusy={selectionBusy}
            onSelect={(item, selected) => void changeSelection({ item, selected })}
            onClearSelection={() => void changeSelection({ clear: true })}
          />
        )}
      </div>

      {detail ? (
        <DesignDetail
          design={detail.design}
          contextLabel={detail.context}
          leftOffset={sidebarExpanded ? 208 : 52}
          onClose={() => setDetail(null)}
          openUrl={detail.design.previewUrl ?? null}
        />
      ) : null}

      <AboutModal open={aboutOpen} onClose={() => setAboutOpen(false)} status={status} />
      <Toast message={toast} onDismiss={() => setToast(null)} />
    </div>
  );
}
