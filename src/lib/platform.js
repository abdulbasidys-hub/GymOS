// Which of the three ways of running GymOS this is.
//
// There are exactly three, and a gym can be using more than one at once —
// the desk PC on the installed app while the owner checks takings on their
// phone is the normal case, not an edge case. So this answers "what is THIS
// client", and the gym document accumulates one last-seen timestamp per
// kind (data/gyms.js's reportGymClient); Sync Monitor shows the union.
//
//   desktop — the packaged Electron build, installed from the .exe
//   pwa     — the web app installed to a phone or desktop home screen
//   web     — an ordinary browser tab
//
// The order of the checks is the whole content of this file. Electron is
// asked first because isInstalledApp() is true there too (it covers "not in
// a browser" generally, which is what it exists for), so asking it first
// would report every desk machine as a PWA.

import { isInstalledApp } from "./standalone";

export const PLATFORMS = ["desktop", "pwa", "web"];

/** Human wording for the three, used wherever one is shown rather than
 *  stored. Kept next to the values themselves so a renamed platform can't
 *  end up labelled by a stale string somewhere else. */
export const PLATFORM_LABELS = {
  desktop: "Desktop app",
  pwa: "Installed app",
  web: "Browser",
};

export function currentPlatform() {
  if (window.gymOS?.isElectron) return "desktop";
  if (isInstalledApp()) return "pwa";
  return "web";
}
