import { useState } from "react";

// A password box with a reveal toggle. Used for every password field in the
// app — signing in, setting a first password, changing one, and the sync
// prompt — so the control behaves identically everywhere rather than being
// re-implemented four times with four sets of bugs.
//
// It matters most on a phone at a front desk, which is where this app is
// actually used: a receptionist typing a password one-handed on a small
// keyboard, standing up, with somebody waiting, has no way of telling a
// mistyped character from a correct one. The alternative to showing them is
// them getting it wrong twice and asking the owner for a reset.
//
// The state is deliberately per-field and starts hidden every time. A toggle
// that remembered "shown" across visits would eventually leave a password
// sitting in plain text on a screen at a public desk.
function EyeIcon({ off }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
      {/* One slash, drawn over the open eye, rather than a second icon: the
          two states then read as the same object switched off, which is what
          a toggle should look like. */}
      {off && <line x1="3" y1="21" x2="21" y2="3" />}
    </svg>
  );
}

export default function PasswordInput({ value, onChange, ...rest }) {
  const [shown, setShown] = useState(false);

  return (
    <span className="password-input">
      <input type={shown ? "text" : "password"} value={value} onChange={onChange} {...rest} />
      <button
        type="button"
        className="password-input__toggle"
        onClick={() => setShown((v) => !v)}
        // The label states what pressing it DOES, not what it currently is,
        // which is what a screen reader user needs from a button.
        aria-label={shown ? "Hide password" : "Show password"}
        aria-pressed={shown}
        // Never a tab stop: tabbing out of the password box should land on
        // the sign-in button, not on a decoration in between.
        tabIndex={-1}
      >
        <EyeIcon off={shown} />
      </button>
    </span>
  );
}
