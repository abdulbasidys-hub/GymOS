import { useState } from "react";

// A table row that expands to reveal more detail — the "layered visibility"
// pattern from BUILD.md §9 (base list for everyone, owner expands for the
// receptionist who did it; admin expands a gym for its owner/subscription).
// `onExpand` fires once, the first time a row opens, so callers can lazy-load
// the expanded detail instead of fetching it for every row up front.
export default function ExpandableRow({ cells, colSpan, onExpand, defaultOpen = false, children }) {
  const [open, setOpen] = useState(defaultOpen);
  const [everOpened, setEverOpened] = useState(defaultOpen);

  function toggle() {
    if (!everOpened && onExpand) {
      onExpand();
      setEverOpened(true);
    }
    setOpen((o) => !o);
  }

  return (
    <>
      <tr className="row--expandable" onClick={toggle}>
        <td className="row__caret">{open ? "▾" : "▸"}</td>
        {cells.map((cell, i) => (
          <td key={i}>{cell}</td>
        ))}
      </tr>
      {open && (
        <tr className="row__expanded">
          <td colSpan={colSpan ?? cells.length + 1}>{children}</td>
        </tr>
      )}
    </>
  );
}
