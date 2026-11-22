import { useEffect, useState } from "react";
import { getCanvas, recordCanvasDecision } from "../api";
import { Topbar } from "../components/AppShell";
import { BackIcon } from "../Icons";
import type { Canvas } from "../types";

export default function CanvasView({ id, onBack }: { id: string; onBack: () => void }) {
  const [canvas, setCanvas] = useState<Canvas | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let active = true;
    getCanvas(id).then(
      (value) => { if (active) setCanvas(value); },
      (reason: Error) => { if (active) setError(reason.message); },
    );
    return () => { active = false; };
  }, [id]);

  const decide = async (card: number, active: boolean) => {
    setBusy(true);
    setError("");
    try {
      setCanvas(await recordCanvasDecision(id, card, active));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="main-scroll community-scroll canvas-view">
      <Topbar
        className="library-topbar"
        left={<button className="library-back" type="button" onClick={onBack} aria-label="Back to all boards"><BackIcon size={16} /> All boards</button>}
        title="Canvas"
      />
      {error ? <p className="library-error" role="alert">{error}</p> : null}
      {!canvas && !error ? <p role="status">Loading Canvas…</p> : null}
      {canvas ? (
        <section aria-labelledby="canvas-title">
          <header className="canvas-heading">
            <h2 id="canvas-title">{canvas.title}</h2>
          </header>
          {canvas.sections.map((section) => (
            <div className="canvas-section" key={section.id}>
              {section.title ? <h3>{section.title}</h3> : null}
              <div className="canvas-options">
                {section.cards.map(({ id, title, note, approvable, references }) => {
                  const active = section.decisions.includes(id);
                  const comparison = section.kind === "compare";
                  const label = comparison ? (active ? "Chosen" : "Choose direction") : (active ? "Approved" : "Approve");
                  return (
                    <article className="canvas-option" key={id}>
                      <div className="canvas-option-text">
                        <h4>{title}</h4>
                        <p>{note}</p>
                        {comparison || approvable ? (
                          <button type="button" aria-label={`${label} ${title}`} aria-pressed={active} disabled={busy} onClick={() => void decide(id, !active)}>
                            {label}
                          </button>
                        ) : null}
                      </div>
                      {references.length ? <div className="canvas-references">
                        {references.map((item) => (
                          <figure key={`${item.app?.id}/${item.id}`}>
                            {item.image ? <img src={item.image} alt={`${item.app?.name} — ${item.title}`} /> : null}
                            <figcaption>
                              {item.url
                                ? <a href={item.url} target="_blank" rel="noreferrer">{item.app?.name} · {item.title} ↗</a>
                                : <span>{item.app?.name} · {item.title}</span>}
                            </figcaption>
                          </figure>
                        ))}
                      </div> : null}
                    </article>
                  );
                })}
              </div>
            </div>
          ))}
        </section>
      ) : null}
    </div>
  );
}
