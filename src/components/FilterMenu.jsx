import { useEffect, useRef, useState } from "react";

function FilterIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
    </svg>
  );
}

// A filter-icon button that reveals a small dropdown of mutually-exclusive
// options — used in list-page headings (Members, Attendance, Finances) in
// place of an always-visible row of filter pills. `options[0]` is treated
// as the "no filter applied" default, for the icon's active-state styling.
export default function FilterMenu({ options, value, onChange }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const isFiltered = value !== options[0]?.key;
  const activeLabel = options.find((o) => o.key === value)?.label;

  return (
    <div className="filter-menu" ref={ref}>
      <button
        type="button"
        className={`btn btn--icon ${isFiltered ? "btn--icon-active" : ""}`}
        onClick={() => setOpen((v) => !v)}
        title={activeLabel ? `Filter: ${activeLabel}` : "Filter"}
        aria-label="Filter"
      >
        <FilterIcon />
      </button>
      {open && (
        <div className="popover">
          {options.map((o) => (
            <button
              key={o.key}
              type="button"
              className={`popover__item ${value === o.key ? "popover__item--active" : ""}`}
              onClick={() => {
                onChange(o.key);
                setOpen(false);
              }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
