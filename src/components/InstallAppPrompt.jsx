import { useEffect, useState } from "react";
import { isInstalledApp } from "../lib/standalone";

// The "put GymOS among the apps on this phone" affordance, shown under the
// sign-in form and nowhere else.
//
// Without it, installing is a thing you have to already know how to do:
// it lives behind a browser menu whose wording and position differ on
// every phone, and most gym staff will never open that menu. With it, the
// person setting a gym up taps one button on the same screen they were
// already looking at.
//
// It renders nothing at all unless the browser has actually told us the
// app can be installed, so it can't sit there offering something that
// won't work — and nothing once the app IS installed, since by then it is
// being read from inside the installed app itself.
//
// Two shapes, because the two mobile platforms disagree:
//
//   Android / Chrome / Edge / Samsung — fire `beforeinstallprompt`, which
//   can be saved and replayed later from a click. That's a real button
//   that opens the system install sheet.
//
//   iOS / iPadOS — no such event, on any browser: Apple only allows
//   installing through Share → Add to Home Screen, and a page cannot
//   trigger or even detect it. All that's honest there is a one-line
//   instruction, so that's what's shown.
export default function InstallAppPrompt() {
  // Captured in main.jsx as well as here: Chrome fires the event once,
  // early, and often before React has mounted this component — reading the
  // stashed one is what stops the button from silently never appearing.
  const [promptEvent, setPromptEvent] = useState(() => window.__gymosInstallPrompt || null);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    function onPrompt(e) {
      // Chrome shows its own mini-infobar unless the event is cancelled;
      // cancelling is also what makes the event replayable from our button.
      e.preventDefault();
      window.__gymosInstallPrompt = e;
      setPromptEvent(e);
    }
    function onInstalled() {
      window.__gymosInstallPrompt = null;
      setInstalled(true);
    }
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  // Already running as the installed app (or the desktop build) — there is
  // nothing left to install.
  if (isInstalledApp() || installed) return null;

  if (promptEvent) {
    return (
      <button
        type="button"
        className="install-app"
        onClick={async () => {
          promptEvent.prompt();
          await promptEvent.userChoice;
          // The saved event is single-use: whether they accepted or
          // dismissed, calling prompt() again throws. Chrome fires a fresh
          // beforeinstallprompt on a later visit if they declined.
          window.__gymosInstallPrompt = null;
          setPromptEvent(null);
        }}
      >
        <PhoneIcon />
        Install GymOS on this device
      </button>
    );
  }

  if (isApplePhoneBrowser()) {
    return (
      <p className="install-app install-app--hint">
        <PhoneIcon />
        <span>
          To install: tap <strong>Share</strong>, then <strong>Add to Home Screen</strong>.
        </span>
      </p>
    );
  }

  return null;
}

// iPhone/iPad, on any browser. iPadOS 13+ reports itself as a Mac, so the
// touch-point count is what separates an iPad from an actual desktop —
// there is no user-agent string that does it.
function isApplePhoneBrowser() {
  const ua = navigator.userAgent || "";
  if (/iPhone|iPad|iPod/.test(ua)) return true;
  return navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1;
}

function PhoneIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="6" y="2" width="12" height="20" rx="2.5" />
      <line x1="10.5" y1="18.5" x2="13.5" y2="18.5" />
    </svg>
  );
}
