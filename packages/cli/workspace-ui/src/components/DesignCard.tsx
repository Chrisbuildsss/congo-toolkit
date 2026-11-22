import DesignFrame from "../DesignFrame";
import type { Design } from "../types";

export default function DesignCard({ design, onOpen, selected, onSelect, selectionBusy }: {
  design: Design;
  onOpen: () => void;
  selected: boolean;
  onSelect: () => void;
  selectionBusy: boolean;
}) {

  return (
    <div
      className={`design-card is-natural${selected ? " is-selected" : ""}`}
      data-format={design.format}
    >
      <DesignFrame design={design} />
      <button type="button" className="card-open" aria-label={`Open ${design.title}`} onClick={onOpen} />
      <div className="card-shade" aria-hidden="true" />
      <div className="card-heading" data-priority="always">
        <button
          type="button"
          className="selection-bubble"
          aria-label={`Select ${design.title}`}
          aria-pressed={selected}
          disabled={selectionBusy}
          onClick={onSelect}
        >
          <span className={selected ? "is-selected" : ""}>{selected ? <i /> : null}</span>
        </button>
        <span className="card-title-pill">
          {design.author ? <small>{design.author}</small> : null}
          <b>{design.title}</b>
        </span>
      </div>
    </div>
  );
}
