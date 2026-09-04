import { useTheme } from "../theme";

function SunIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
      <path d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 1020.354 15.354z" />
    </svg>
  );
}

// Quick light/dark switch, in every role's topbar and on the login page.
// The button itself is a swatch of the theme clicking it would switch TO —
// currently dark -> a white button (previewing light); currently light -> a
// near-black button (previewing dark) — not just an icon on neutral chrome.
// For the full light/dark/system choice, see ThemePreference.jsx (Settings).
export default function ThemeToggle() {
  const { effective, toggle } = useTheme();
  const goingToLight = effective === "dark";
  return (
    <button
      type="button"
      className={`theme-toggle ${goingToLight ? "theme-toggle--to-light" : "theme-toggle--to-dark"}`}
      onClick={toggle}
      title={goingToLight ? "Switch to light mode" : "Switch to dark mode"}
      aria-label="Toggle color theme"
    >
      {goingToLight ? <SunIcon /> : <MoonIcon />}
    </button>
  );
}
