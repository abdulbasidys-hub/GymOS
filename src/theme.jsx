// Light/dark/system theme preference — persisted, applied as a `data-theme`
// attribute on <html> that index.css's :root[data-theme="..."] blocks (and
// the prefers-color-scheme media query, for "system") key off of.

import { createContext, useContext, useEffect, useState } from "react";

const STORAGE_KEY = "gymos-theme";
const ThemeContext = createContext(null);

function applyTheme(preference) {
  const root = document.documentElement;
  if (preference === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", preference);
}

export function ThemeProvider({ children }) {
  // Light is the default, not "system". A first-time visitor or a freshly
  // installed desk machine gets light regardless of what the OS is set to —
  // GymOS is a light-first product and should look like itself on first
  // run, rather than inheriting whatever a particular Windows install
  // happens to have configured.
  //
  // "system" remains a first-class CHOICE in the settings picker; it just
  // isn't the default any more. Anything already stored still wins, so
  // nobody who has picked a theme gets overridden by this.
  //
  // index.html applies the same rule inline before this bundle loads —
  // without that, a dark-OS machine paints one dark frame from the
  // prefers-color-scheme fallback before React mounts. Keep the two in
  // sync: same storage key, same default.
  const [preference, setPreference] = useState(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    return stored === "light" || stored === "dark" || stored === "system" ? stored : "light";
  });

  useEffect(() => {
    applyTheme(preference);
    localStorage.setItem(STORAGE_KEY, preference);
  }, [preference]);

  // Only matters while preference === "system" — lets the toggle button
  // know whether it's CURRENTLY showing light or dark, so its icon/label is
  // correct even when no explicit choice has been made.
  const [systemIsDark, setSystemIsDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches
  );
  useEffect(() => {
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = (e) => setSystemIsDark(e.matches);
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const effective = preference === "system" ? (systemIsDark ? "dark" : "light") : preference;

  const value = {
    preference, // "light" | "dark" | "system"
    effective,  // "light" | "dark" — what's actually showing right now
    setPreference,
    toggle: () => setPreference(effective === "dark" ? "light" : "dark"),
  };

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
