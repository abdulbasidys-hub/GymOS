import { useLayoutEffect, useRef, useState } from "react";
import { Navigate, Link } from "react-router-dom";
import { useAuth } from "../auth";
import { signInWithUsername } from "../data";
import { homePathFor } from "../lib/roles";
import Logo from "../components/Logo";

function UserIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2" />
      <circle cx="12" cy="7" r="4" />
    </svg>
  );
}

function LockIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0110 0v4" />
    </svg>
  );
}

// Friendly messages for the common Firebase auth codes. Unknown codes show the
// raw code so problems are easy to diagnose during setup.
function messageFor(code) {
  switch (code) {
    case "auth/operation-not-allowed":
      return "Email/Password sign-in isn't enabled in Firebase.";
    case "auth/too-many-requests":
      return "Too many attempts. Wait a moment and try again.";
    case "auth/invalid-email":
      return "That username can't be used.";
    case "auth/invalid-credential":
    case "auth/wrong-password":
    case "auth/user-not-found":
      return "Incorrect username or password.";
    // Offline authentication (BUILD.md §15) — surfaced by
    // data/accounts.js's signInWithUsername when a network sign-in fails
    // and the local (Electron-only) fallback also can't proceed.
    case "local/offline-credential-missing":
      return "This account hasn't signed in on this device before — connect to the internet once, then try again.";
    case "local/offline-credential-expired":
      return "This device hasn't been online in over 14 days — connect to the internet once to keep offline sign-in working.";
    case "auth/network-request-failed":
      return "Can't reach the server. Check your internet connection and try again.";
    default:
      return `Sign-in failed (${code || "unknown error"}).`;
  }
}

export default function LoginPage() {
  const { status, role } = useAuth();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  // Grows "GymOS" until it's exactly as wide as the tagline below it, so
  // their left edges and right edges both line up — there's no fixed font
  // size that does this for two different strings ("GymOS" vs "Run Your
  // Gym Smarter"), so it's measured: read both elements' real rendered
  // width, then scale the title's font-size by that ratio (text width
  // scales ~linearly with font-size, so one measurement pass lands very
  // close, no iteration needed). Re-runs if the tagline's own width
  // shifts (e.g. the web font swapping in after first paint).
  const titleRef = useRef(null);
  const taglineRef = useRef(null);
  const [titleFontSize, setTitleFontSize] = useState(22);
  useLayoutEffect(() => {
    const titleEl = titleRef.current;
    const taglineEl = taglineRef.current;
    if (!titleEl || !taglineEl) return;
    function fitTitleToTagline() {
      const titleWidth = titleEl.getBoundingClientRect().width;
      const taglineWidth = taglineEl.getBoundingClientRect().width;
      if (!titleWidth || !taglineWidth) return;
      const currentSize = parseFloat(getComputedStyle(titleEl).fontSize);
      setTitleFontSize(currentSize * (taglineWidth / titleWidth));
    }
    fitTitleToTagline();
    const observer = new ResizeObserver(fitTitleToTagline);
    observer.observe(taglineEl);
    return () => observer.disconnect();
  }, []);

  // Already signed in → bounce to the right home.
  if (status === "ready") return <Navigate to={homePathFor(role)} replace />;

  async function submit(e) {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await signInWithUsername(username, password);
      // The auth listener updates status → redirect happens on next render.
    } catch (err) {
      console.error("Sign-in error:", err?.code, err);
      setError(messageFor(err?.code));
      setBusy(false);
    }
  }

  const brandLockup = (
    <>
      <Logo size={40} iconOnly />
      <div className="login__header-text">
        <h1 className="login__title" ref={titleRef} style={{ fontSize: titleFontSize }}>
          Gym<span className="login__title-accent">OS</span>
        </h1>
        <p className="login__tagline" ref={taglineRef}>Run Your Gym Smarter</p>
      </div>
    </>
  );

  return (
    <div className="login">
      <form className="login__card" onSubmit={submit}>
        {/* The brand lockup doubles as the way back to the marketing site
            on the web build. Not a link under Electron: there is no
            marketing site there (App.jsx routes "/" straight to this page
            for the desktop app), so a link would either dead-end or bounce
            the user right back here. `brandLockup` is rendered identically
            either way — only the wrapper differs — so the layout, the
            measured title font size, and the tagline are untouched. */}
        {window.gymOS?.isElectron ? (
          <div className="login__header">{brandLockup}</div>
        ) : (
          <Link to="/" className="login__header login__header--link" aria-label="GymOS home">
            {brandLockup}
          </Link>
        )}

        <label className="field">
          <span>Username</span>
          <div className="field__control">
            <UserIcon />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              autoCapitalize="none"
              spellCheck="false"
              required
            />
          </div>
        </label>

        <label className="field">
          <span>Password</span>
          <div className="field__control">
            <LockIcon />
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </div>
        </label>

        {error && <div className="login__error">{error}</div>}

        <button className="btn btn--primary" type="submit" disabled={busy}>
          {busy ? "Signing in…" : "Sign in"}
        </button>

        <p className="login__footer">GymOS by Nobody Brothers</p>
      </form>
    </div>
  );
}
