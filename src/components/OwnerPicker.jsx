import { useEffect, useRef, useState } from "react";

const MAX_SUGGESTIONS = 8;

// A text input that suggests existing owners as you type (name/username
// substring match, case-insensitive) — same shape as CountryPicker.jsx
// (same .popover dropdown shell, same controlled value/onChange(owner|null)
// contract: typing invalidates the previous pick until a suggestion is
// actually clicked), just searching a caller-supplied `owners` list
// (NewGym.jsx's listOwners() result) instead of a static country list.
export default function OwnerPicker({ owners, value, onChange, placeholder = "Start typing an owner's name…" }) {
  const [query, setQuery] = useState(value?.name || "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef(null);
  const lastEmitted = useRef(value);

  useEffect(() => {
    if (value === lastEmitted.current) return;
    lastEmitted.current = value;
    setQuery(value?.name || "");
  }, [value]);

  useEffect(() => {
    if (!open) return;
    function onDocClick(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  const q = query.trim().toLowerCase();
  const suggestions = open
    ? (q
        ? owners.filter((o) => o.name?.toLowerCase().includes(q) || o.username?.toLowerCase().includes(q))
        : owners
      ).slice(0, MAX_SUGGESTIONS)
    : [];

  function select(owner) {
    setQuery(owner.name);
    lastEmitted.current = owner;
    onChange(owner);
    setOpen(false);
  }

  function onKeyDown(e) {
    if (!open || suggestions.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((h) => Math.min(h + 1, suggestions.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(h - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      select(suggestions[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="country-picker" ref={ref}>
      <input
        type="text"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setHighlight(0);
          setOpen(true);
          if (value) {
            lastEmitted.current = null;
            onChange(null); // typing again invalidates the previous pick
          }
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck="false"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
      />
      {open && suggestions.length > 0 && (
        <div className="popover country-picker__list" role="listbox">
          {suggestions.map((o, i) => (
            <button
              type="button"
              key={o.id}
              className={`popover__item ${i === highlight ? "popover__item--highlighted" : ""}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => select(o)}
            >
              {o.name} <span className="muted">· {o.username}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
