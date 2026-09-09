import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "@fontsource-variable/inter/wght.css";
import "./index.css";

// Chrome decides a site is installable and fires `beforeinstallprompt`
// once, early — routinely before React has mounted the login screen. The
// event is only replayable if it was cancelled when it fired, so it has to
// be caught here, at the very top of the bundle, and stashed for
// components/InstallAppPrompt.jsx to find. Miss it and the "Install GymOS
// on this device" button simply never appears, with nothing to debug.
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault();
  window.__gymosInstallPrompt = e;
});

// Registers public/sw.js, which is what makes the app installable at all:
// Chrome will not offer to install a site without a service worker that
// has a fetch handler, however complete its manifest is.
//
// Skipped for the desktop build — Electron serves index.html over file://,
// where service workers do not apply and registration throws. The protocol
// check covers that and any other non-http context; localhost counts as a
// secure origin, so this still runs under `npm run dev`.
if (!window.gymOS?.isElectron && "serviceWorker" in navigator && location.protocol.startsWith("http")) {
  // After load, not during: registration competes with the app's own first
  // paint and its first Firebase calls otherwise, and nothing on screen
  // depends on it having finished.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch((err) => {
      // Non-fatal by design. No service worker means no offline shell and
      // no install prompt; the app itself works exactly as before.
      console.warn("Service worker registration failed:", err);
    });
  });
}

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
