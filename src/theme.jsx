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

// On a phone, the browser paints its own address/status bar in whatever
// <meta name="theme-color"> says — leave it alone and a dark-themed app
// sits inside a white frame (or the reverse), which is the single most
// "this is a website, not an app" tell during a demo. index.html ships two
// media-scoped tags so the very first paint already matches the OS
// preference; this replaces them with one unconditional tag matching the
// theme actually showing, since the in-app toggle can disagree with the OS.
// Values are the literal --bg of each theme (index.css) — read from the
// tokens rather than hardcoded, so this can't drift if the palette moves.
function applyThemeColor(effective) {
  const bg = getComputedStyle(document.documentElement).getPropertyValue("--bg").trim();
  if (!bg) return;
  document
    .querySelectorAll('meta[name="theme-color"][media]')
    .forEach((el) => el.remove());
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", bg);
  // iOS uses its own tag for the status bar text colour in a home-screen
  // install; "black-translucent" is what keeps white text legible over a
  // dark app, "default" (dark text) over a light one.
  const status = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (status) status.setAttribute("content", effective === "dark" ? "black-translucent" : "default");
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

  // After applyTheme has set/removed data-theme (its effect runs first, in
  // declaration order), so the computed --bg read inside is the new one.
  useEffect(() => {
    applyThemeColor(effective);
  }, [effective]);

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
