import { useState } from "react";

function SearchIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="11" cy="11" r="7" />
      <line x1="21" y1="21" x2="16.65" y2="16.65" />
    </svg>
  );
}

// A search box that starts collapsed to just an icon (keeps a list page's
// heading row compact) and expands into a small input on click. Closing it
// again clears whatever was typed, since a hidden input still silently
// filtering the list underneath would be confusing.
export default function SearchToggle({ value, onChange, placeholder = "Search" }) {
  const [open, setOpen] = useState(false);

  function toggle() {
    setOpen((wasOpen) => {
      if (wasOpen) onChange("");
      return !wasOpen;
    });
  }

  return (
    <div className="search-toggle">
      {open && (
        <input
          autoFocus
          className="search-toggle__input"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
        />
      )}
      <button type="button" className="btn btn--icon" onClick={toggle} title="Search" aria-label="Search">
        <SearchIcon />
      </button>
    </div>
  );
}
