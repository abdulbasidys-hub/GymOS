// "Is this GymOS running as an installed app rather than a page in a
// browser?"
//
// Two things run as an installed app: the Electron desktop build, and the
// PWA once it's been added to a phone's home screen. Neither has any use
// for the marketing site — there is no address bar to leave through, the
// only reason the app was opened is to sign in and work, and a visitor
// landing on Home/Product/Pricing inside what is supposed to be "the gym's
// app" reads as the wrong application having opened. So both are treated
// identically at every point where the app decides between showing the
// public site and showing the login screen:
//
//   - App.jsx's Home(), for "/"
//   - App.jsx's PublicSite guard, for /product, /pricing and /contact
//   - LoginPage.jsx, for whether the brand lockup links back to the site
//
// The PWA's manifest already sets start_url to /login, so a normal launch
// never touches those routes. This is the backstop for the ways a URL can
// arrive anyway: a link opened from a message or another app, a route
// restored by the browser, someone's saved bookmark.
//
// Evaluated per call rather than cached in a module constant. Display mode
// is fixed for the life of a document in practice, but a call is a cheap
// media query and a stale constant here would silently show the marketing
// site inside the app — the exact thing this file exists to prevent.
export function isInstalledApp() {
  // The desktop build. Injected by electron/preload before anything here
  // runs, so this is the same signal the rest of the app branches on.
  if (window.gymOS?.isElectron) return true;

  // The PWA on Android/Chrome/Edge/desktop Chrome. "standalone" is what
  // this app's manifest asks for; the other two are included because a
  // browser may honour a display mode other than the one requested, and
  // in every one of them there is no address bar to navigate with.
  const modes = ["standalone", "fullscreen", "minimal-ui"];
  if (window.matchMedia && modes.some((m) => window.matchMedia(`(display-mode: ${m})`).matches)) {
    return true;
  }

  // iOS/iPadOS. Safari has never implemented display-mode for home-screen
  // apps and exposes this non-standard flag instead — without it, every
  // iPhone running the installed app would fall through to the browser
  // branch above and be shown the marketing site.
  if (window.navigator.standalone === true) return true;

  return false;
}
