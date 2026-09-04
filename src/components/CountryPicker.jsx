import { useEffect, useRef, useState } from "react";
import { searchCountries } from "../lib/countries";

const MAX_SUGGESTIONS = 8;

// A text input that suggests countries as you type (name substring match,
// case-insensitive) — same .popover dropdown shell FilterMenu.jsx uses, so
// it looks native to the rest of the app rather than a one-off widget.
// `value` is the selected country object ({ name, code, currency }) or
// null; `onChange` fires with a real country only on an actual pick — while
// typing (no match committed yet), it fires with null so callers can gate
// submit on "a country was actually chosen," not just "something's typed."
export default function CountryPicker({ value, onChange, placeholder = "Start typing a country…" }) {
  const [query, setQuery] = useState(value?.name || "");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const ref = useRef(null);
  // Every keystroke invalidates the previous pick by calling onChange(null)
  // — which comes back around as a new `value` prop next render. Without
  // this ref, the sync effect below can't tell "the parent reset `value`
  // for some reason of its own" apart from "I just did that myself by
  // typing," and in the latter case it would stomp the query right back to
  // "" mid-keystroke (the effect fires from the SAME re-render that echoes
  // our own onChange(null) back down). Tracking what we last told the
  // parent lets the effect skip re-syncing on its own echo.
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

  const suggestions = open ? searchCountries(query).slice(0, MAX_SUGGESTIONS) : [];

  function select(country) {
    setQuery(country.name);
    lastEmitted.current = country;
    onChange(country);
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
          {suggestions.map((c, i) => (
            <button
              type="button"
              key={c.code}
              className={`popover__item ${i === highlight ? "popover__item--highlighted" : ""}`}
              role="option"
              aria-selected={i === highlight}
              onMouseDown={(e) => e.preventDefault()}
              onMouseEnter={() => setHighlight(i)}
              onClick={() => select(c)}
            >
              {c.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
