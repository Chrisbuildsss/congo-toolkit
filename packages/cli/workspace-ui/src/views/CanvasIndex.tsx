import { useEffect, useState } from "react";
import { getCanvases } from "../api";
import { Topbar } from "../components/AppShell";
import type { CanvasSummary } from "../types";

export default function CanvasIndex({ onOpen }: { onOpen: (id: string) => void }) {
  const [boards, setBoards] = useState<CanvasSummary[] | null>(null);
  const [error, setError] = useState("");
  const [refresh, setRefresh] = useState(0);

  useEffect(() => {
    const reload = () => setRefresh((count) => count + 1);
    window.addEventListener("focus", reload);
    return () => window.removeEventListener("focus", reload);
  }, []);

  useEffect(() => {
    let active = true;
    getCanvases().then(
      ({ boards }) => {
        if (!active) return;
        setBoards(boards);
        setError("");
      },
      (reason: Error) => { if (active) setError(reason.message); },
    );
    return () => { active = false; };
  }, [refresh]);

  return (
    <div className="main-scroll community-scroll canvas-view canvas-index">
      <Topbar className="library-topbar" title="Canvas" />
      <section aria-labelledby="recent-boards-title">
        <header className="canvas-heading">
          <h2 id="recent-boards-title">Recent boards</h2>
        </header>
        {error ? (
          <div className="library-error" role="alert">
            {error}
            <button type="button" onClick={() => setRefresh((count) => count + 1)}>Try again</button>
          </div>
        ) : null}
        {!boards && !error ? <p role="status">Loading boards…</p> : null}
        {boards?.length ? (
          <ul className="canvas-board-list">
            {boards.map(({ id, title, project }) => (
              <li key={id}>
                <button type="button" onClick={() => onOpen(id)}>
                  <strong>{title}</strong>
                  {project ? <span>{project}</span> : null}
                </button>
              </li>
            ))}
          </ul>
        ) : boards && !error ? (
          <p className="canvas-board-empty">No boards yet. Ask your AI to show something in Congo Canvas.</p>
        ) : null}
      </section>
    </div>
  );
}
