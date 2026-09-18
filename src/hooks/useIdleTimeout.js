// Signs the user out after a stretch of no mouse/keyboard/touch activity
// (BUILD.md §15) — an unattended signed-in desk or browser tab shouldn't
// stay usable indefinitely. Every platform, every role; the length of that
// stretch is the one thing that differs (see idleTimeoutMs below).
//
// A plain setTimeout alone can't catch a laptop that SLEPT through the
// window — timers don't run while the OS suspends the process, but wall-
// clock time keeps passing regardless. So the last-activity timestamp is
// also persisted (localStorage; Electron additionally mirrors it into
// local_session, since that's the same table the offline-auth pass reads
// as its source of truth for the active session) and re-checked on
// visibilitychange/focus — the case that actually matters here ("someone
// left the account open, walked away, the laptop slept, someone else
// opens it later") is caught THERE, not by the timer.

import { useEffect, useRef } from "react";
import { localInvoke } from "../data/local/bridge";
import { isInstalledApp } from "../lib/standalone";

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
const HANDHELD_IDLE_TIMEOUT_MS = 6 * 60 * 60 * 1000;

/** How long this device is allowed to sit untouched before it signs itself
 *  out. 30 minutes everywhere except one case: GymOS installed to the home
 *  screen of a phone or tablet, where it's 6 hours.
 *
 *  Why that case is different. The 30 minutes exists for a screen somebody
 *  can walk up to — a desk PC, an office laptop, a browser tab left open on
 *  a shared machine. A phone is not that screen: it's one person's, it's in
 *  a pocket or face-down on the counter, and it has its own lock. What 30
 *  minutes actually buys on a phone is a re-login every single time the
 *  reception picks it up after a quiet half-hour, because a backgrounded app
 *  receives no activity events — and for a gym running the front desk off a
 *  phone rather than a laptop, that is the whole day. 6 hours covers a shift.
 *
 *  Deliberately NOT extended to: Electron (that's the desk machine the rule
 *  was written for), a plain mobile browser tab (not the app, and a tab can
 *  be left open on anything), and the PWA installed on a desktop — same
 *  shared-screen risk as Electron, which is what the pointer check below
 *  separates out. Evaluated per call, like isInstalledApp() itself, rather
 *  than frozen into a module constant at import time. */
function idleTimeoutMs() {
  if (window.gymOS?.isElectron) return IDLE_TIMEOUT_MS;
  if (!isInstalledApp()) return IDLE_TIMEOUT_MS;
  // Touch-primary — a phone or tablet, not a desktop-installed PWA. If the
  // browser can't answer, the shorter timeout is the safe way to be wrong.
  const handheld = window.matchMedia?.("(pointer: coarse)")?.matches === true;
  return handheld ? HANDHELD_IDLE_TIMEOUT_MS : IDLE_TIMEOUT_MS;
}
const ACTIVITY_EVENTS = ["mousemove", "keydown", "click", "scroll", "touchstart"];
const WRITE_THROTTLE_MS = 5000; // don't hammer localStorage/IPC on every single mousemove
const STORAGE_KEY = "gymos.lastActivityAt";

function readLastActivity() {
  const raw = localStorage.getItem(STORAGE_KEY);
  const parsed = raw ? Number(raw) : NaN;
  return Number.isFinite(parsed) ? parsed : Date.now();
}

function writeLastActivity(ts) {
  try {
    localStorage.setItem(STORAGE_KEY, String(ts));
  } catch {
    // private-browsing/storage-full edge case — the in-memory timer below still works within this tab session
  }
  if (window.gymOS?.isElectron) {
    localInvoke("touchLocalSessionActivity", { at: new Date(ts).toISOString() }).catch(() => {});
  }
}

/** `active` gates the whole hook (pass `status === "ready"`) so it's a
 *  no-op on the login screen itself. `onTimeout` is typically
 *  `signOutUser`. */
export function useIdleTimeout(active, onTimeout) {
  const timerRef = useRef(null);
  const onTimeoutRef = useRef(onTimeout);
  onTimeoutRef.current = onTimeout;

  useEffect(() => {
    if (!active) return;

    function scheduleFrom(lastActivityAt) {
      clearTimeout(timerRef.current);
      const remaining = idleTimeoutMs() - (Date.now() - lastActivityAt);
      if (remaining <= 0) {
        onTimeoutRef.current();
        return;
      }
      timerRef.current = setTimeout(() => onTimeoutRef.current(), remaining);
    }

    let lastWrite = 0;
    function onActivity() {
      const now = Date.now();
      if (now - lastWrite < WRITE_THROTTLE_MS) return;
      lastWrite = now;
      writeLastActivity(now);
      scheduleFrom(now);
    }

    // The check that actually matters — see file header.
    function recheckAfterPossibleSleep() {
      if (document.visibilityState !== "visible") return;
      const last = readLastActivity();
      if (Date.now() - last >= idleTimeoutMs()) onTimeoutRef.current();
      else scheduleFrom(last);
    }

    writeLastActivity(Date.now()); // becoming active (e.g. just signed in) counts as activity
    scheduleFrom(Date.now());

    for (const evt of ACTIVITY_EVENTS) window.addEventListener(evt, onActivity, { passive: true });
    document.addEventListener("visibilitychange", recheckAfterPossibleSleep);
    window.addEventListener("focus", recheckAfterPossibleSleep);

    return () => {
      clearTimeout(timerRef.current);
      for (const evt of ACTIVITY_EVENTS) window.removeEventListener(evt, onActivity);
      document.removeEventListener("visibilitychange", recheckAfterPossibleSleep);
      window.removeEventListener("focus", recheckAfterPossibleSleep);
    };
  }, [active]);
}
