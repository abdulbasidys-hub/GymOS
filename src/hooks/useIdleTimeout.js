// Signs the user out after 30 minutes of no mouse/keyboard/touch activity
// (BUILD.md §15) — an unattended signed-in desk or browser tab shouldn't
// stay usable indefinitely. Universal: every platform, every role.
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

const IDLE_TIMEOUT_MS = 30 * 60 * 1000;
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
      const remaining = IDLE_TIMEOUT_MS - (Date.now() - lastActivityAt);
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
      if (Date.now() - last >= IDLE_TIMEOUT_MS) onTimeoutRef.current();
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
